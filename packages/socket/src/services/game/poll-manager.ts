import { EVENTS } from "@razzia/common/constants"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type {
  PollOutcome,
  PollResultRecord,
  PollSnapshot,
  PollTally,
  PollVoteOutcome,
  PollVoter,
  PollWithId,
} from "@razzia/common/types/poll"
import type { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { nanoid } from "nanoid"

// Changing a vote is allowed until the host closes the poll; this only stops a
// stuck or scripted client from flooding the host with updates. It is counted
// per client, never per address: a whole class shares one.
export const MAX_VOTE_CHANGES = 30

type Phase = "idle" | "open" | "closed"

export interface PollManagerOptions {
  io: Server
  players: Pick<PlayerManager, "getAll" | "findById" | "findByClientId">
  gameSubject: string
  getManagerId: () => string
  isManager: (_socket: Socket) => boolean
  // Called with every record the poll leaves behind. `false` says it could not
  // be kept, and the record is offered again later.
  onSettled: (_record: PollResultRecord) => boolean
}

/**
 * One poll at a time in a room: who has voted for what, and what each screen
 * is told about it. It knows nothing of the quiz round or of the room's
 * statuses; the room decides when a poll may start.
 */
export class PollManager {
  private readonly opts: PollManagerOptions
  private phase: Phase = "idle"
  private poll: PollWithId | null = null
  // The one record of who voted for what. In an anonymous poll it never leaves
  // this object.
  private readonly votes = new Map<string, number>()
  private readonly changes = new Map<string, number>()
  // Fixed when the poll closes, so nothing afterwards (a kick) moves it.
  private closedCounts: number[] | null = null
  private closedVoters: PollVoter[] | undefined = undefined
  private unsaved: PollResultRecord[] = []

  constructor(opts: PollManagerOptions) {
    this.opts = opts
  }

  isActive(): boolean {
    return this.phase !== "idle"
  }

  start(socket: Socket, poll: PollWithId): PollOutcome {
    if (!this.opts.isManager(socket)) {
      return "notManager"
    }

    if (this.phase !== "idle") {
      return "busy"
    }

    this.reset()
    this.phase = "open"
    this.poll = { ...poll, options: [...poll.options] }
    this.emitState()

    return "accepted"
  }

  vote(socket: Socket, pollId: string, option: number): PollVoteOutcome {
    const player = this.opts.players.findById(socket.id)

    if (!player) {
      return "notPlayer"
    }

    if (this.phase !== "open" || !this.poll) {
      return "closed"
    }

    if (
      pollId !== this.poll.id ||
      !Number.isInteger(option) ||
      option < 0 ||
      option >= this.poll.options.length
    ) {
      return "invalid"
    }

    const before = this.votes.get(player.clientId)

    if (before === option) {
      return "unchanged"
    }

    if (before !== undefined) {
      const changes = (this.changes.get(player.clientId) ?? 0) + 1

      if (changes > MAX_VOTE_CHANGES) {
        return "tooManyChanges"
      }

      this.changes.set(player.clientId, changes)
    }

    this.votes.set(player.clientId, option)
    this.emitTally()

    return "accepted"
  }

  close(socket: Socket): PollOutcome {
    if (!this.opts.isManager(socket)) {
      return "notManager"
    }

    if (this.phase !== "open") {
      return "none"
    }

    this.freeze()
    this.keep(this.buildRecord(false))
    this.emitState()

    return "accepted"
  }

  dismiss(socket: Socket): PollOutcome {
    if (!this.opts.isManager(socket)) {
      return "notManager"
    }

    if (this.phase !== "closed") {
      return "none"
    }

    this.reset()
    this.emitState()

    return "accepted"
  }

  // A vote leaves with its voter, but only while the poll is open: a closed
  // poll's result stays as the host saw it.
  forgetPlayer(clientId: string): void {
    if (this.phase !== "open") {
      return
    }

    this.changes.delete(clientId)

    if (this.votes.delete(clientId)) {
      this.emitTally()
    }
  }

  /**
   * The room is closing. A poll still open is kept as a partial result, and a
   * result whose save failed is offered again; nothing is ever written twice.
   */
  settlePending(): void {
    if (this.phase === "open" && this.poll) {
      this.freeze()
      this.keep(this.buildRecord(true))
    }

    this.flush()
  }

  /** The room is gone: drop who voted for what. */
  stop(): void {
    this.reset()
  }

  snapshotForHost(): PollSnapshot | null {
    if (this.phase === "idle" || !this.poll) {
      return null
    }

    const counts = this.currentCounts()
    const voters = this.currentVoters()

    return {
      ...baseOf(this.poll, this.phase),
      counts,
      total: sum(counts),
      ...(voters ? { voters } : {}),
    }
  }

  /**
   * What a screen that has just opened should show: the host's view for the
   * host, a player's own for a player, and `undefined` for a socket that is
   * neither in this room.
   */
  snapshotForSocket(socket: Socket): PollSnapshot | null | undefined {
    if (this.opts.isManager(socket)) {
      return this.snapshotForHost()
    }

    const player = this.opts.players.findById(socket.id)

    return player ? this.snapshotForPlayer(player.clientId) : undefined
  }

  snapshotForPlayer(clientId: string): PollSnapshot | null {
    if (this.phase === "idle" || !this.poll) {
      return null
    }

    const counts = this.phase === "closed" ? this.currentCounts() : undefined

    return {
      ...baseOf(this.poll, this.phase),
      mine: this.votes.get(clientId) ?? null,
      ...(counts ? { counts, total: sum(counts) } : {}),
    }
  }

  private currentCounts(): number[] {
    if (this.closedCounts) {
      return this.closedCounts
    }

    const counts = (this.poll?.options ?? []).map(() => 0)

    for (const option of this.votes.values()) {
      counts[option] += 1
    }

    return counts
  }

  // Names only ever for a named poll.
  private currentVoters(): PollVoter[] | undefined {
    if (this.phase === "closed") {
      return this.closedVoters
    }

    if (!this.poll || this.poll.anonymous) {
      return undefined
    }

    return [...this.votes]
      .flatMap(([clientId, option]) => {
        const player = this.opts.players.findByClientId(clientId)

        return player ? [{ username: player.username, option }] : []
      })
      .sort(
        (a, b) => a.option - b.option || a.username.localeCompare(b.username),
      )
  }

  private freeze(): void {
    this.closedCounts = this.currentCounts()
    this.closedVoters = this.currentVoters()
    this.phase = "closed"
  }

  private reset(): void {
    this.phase = "idle"
    this.poll = null
    this.votes.clear()
    this.changes.clear()
    this.closedCounts = null
    this.closedVoters = undefined
  }

  private buildRecord(partial: boolean): PollResultRecord {
    const { poll } = this
    const counts = this.currentCounts()
    const voters = this.currentVoters()

    if (!poll) {
      throw new Error("No poll to record")
    }

    return {
      id: `${Date.now()}-${nanoid(8)}`,
      pollId: poll.id,
      question: poll.question,
      options: [...poll.options],
      anonymous: poll.anonymous,
      date: new Date().toISOString(),
      gameSubject: this.opts.gameSubject,
      counts,
      total: sum(counts),
      ...(voters ? { voters } : {}),
      ...(partial ? { partial: true } : {}),
    }
  }

  private keep(record: PollResultRecord): void {
    this.unsaved.push(record)
    this.flush()
  }

  // A saver that throws is a save that failed: the poll still closes for
  // everyone, and the record is offered again when the room closes.
  private flush(): void {
    this.unsaved = this.unsaved.filter((record) => {
      try {
        return !this.opts.onSettled(record)
      } catch (error) {
        console.error("Failed to save a poll result:", error)

        return true
      }
    })
  }

  // Each connected player gets their own view, and the host theirs; nothing is
  // broadcast, so no screen ever sees another screen's view.
  private emitState(): void {
    for (const player of this.opts.players.getAll()) {
      if (player.connected) {
        this.opts.io
          .to(player.id)
          .emit(EVENTS.POLL.STATE, this.snapshotForPlayer(player.clientId))
      }
    }

    this.opts.io
      .to(this.opts.getManagerId())
      .emit(EVENTS.POLL.STATE, this.snapshotForHost())
  }

  private emitTally(): void {
    if (!this.poll) {
      return
    }

    const counts = this.currentCounts()
    const voters = this.currentVoters()
    const tally: PollTally = {
      pollId: this.poll.id,
      counts,
      total: sum(counts),
      ...(voters ? { voters } : {}),
    }

    this.opts.io.to(this.opts.getManagerId()).emit(EVENTS.POLL.TALLY, tally)
  }
}

const sum = (counts: number[]): number =>
  counts.reduce((total, count) => total + count, 0)

const baseOf = (poll: PollWithId, phase: "open" | "closed") => ({
  pollId: poll.id,
  question: poll.question,
  options: poll.options,
  anonymous: poll.anonymous,
  phase,
})
