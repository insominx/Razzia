import { EVENTS, LECTURE_TEXT } from "@razzia/common/constants"
import type {
  GameResult,
  LectureOutcome,
  LectureState,
  Player,
  Quizz,
} from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import type {
  PollOutcome,
  PollResultRecord,
  PollVoteOutcome,
} from "@razzia/common/types/poll"
import type { ResolvedVisuals } from "@razzia/common/types/visuals"
import { saveResult } from "@razzia/socket/services/config"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import {
  DROP_GRACE_MS,
  PlayerManager,
  toPublicPlayer,
} from "@razzia/socket/services/game/player-manager"
import { PollManager } from "@razzia/socket/services/game/poll-manager"
import { RoundManager } from "@razzia/socket/services/game/round-manager"
import { getPollById, savePollResult } from "@razzia/socket/services/poll-store"
import Registry from "@razzia/socket/services/registry"
import { createInviteCode } from "@razzia/socket/utils/game"
import { logSafe } from "@razzia/socket/utils/safe"
import { v7 as uuid } from "uuid"

const registry = Registry.getInstance()

interface GameOptions {
  io: Server
  socket: Socket
  quizz: Quizz
  visuals: ResolvedVisuals
  // Played from a lecture deck: one question at a time, with the room
  // holding between them.
  lecture?: boolean
  // Keeps what a poll leaves behind; `false` says it could not be kept. By
  // default it goes to `config/poll-results/`; tests hand in their own.
  onPollSettled?: (_record: PollResultRecord) => boolean
}

interface StatusSnapshot {
  name: Status
  data: StatusDataMap[Status]
}

export const restampReconnectStatus = <T extends StatusSnapshot>(
  status: T,
  serverNow = Date.now(),
): T => {
  if (
    status.name !== STATUS.SELECT_ANSWER &&
    status.name !== STATUS.SHOW_QUESTION &&
    status.name !== STATUS.SHOW_RESULT &&
    status.name !== STATUS.SHOW_RESPONSES
  ) {
    return status
  }

  return {
    ...status,
    data: { ...status.data, serverNow },
  } as T
}

export const selectReconnectStatus = (
  targetStatus: StatusSnapshot | null | undefined,
  roomStatus: StatusSnapshot | null | undefined,
): StatusSnapshot =>
  targetStatus ??
  roomStatus ?? {
    name: STATUS.WAIT,
    data: { text: "game:waitingForPlayers" },
  }

// A poll rides on the reconnect payload only while one is showing, so a room
// without a poll sends exactly what it always did.
const pollPayload = <T extends object>(snapshot: T | null): { poll?: T } =>
  snapshot ? { poll: snapshot } : {}

class Game {
  readonly gameId: string
  readonly inviteCode: string
  readonly visuals: ResolvedVisuals
  readonly lecture: boolean

  private readonly io: Server
  private readonly _manager: {
    id: string
    clientId: string
    connected: boolean
  }
  private readonly playerManager: PlayerManager
  private readonly round: RoundManager
  private readonly poll: PollManager
  private readonly cooldown: CooldownTimer

  private lastBroadcastStatus: {
    name: Status
    data: StatusDataMap[Status]
  } | null = null
  private managerStatus: {
    name: Status
    data: StatusDataMap[Status]
  } | null = null
  private playerStatus = new Map<
    string,
    { name: Status; data: StatusDataMap[Status] }
  >()
  private resultSaved = false

  constructor({
    io,
    socket,
    quizz,
    visuals,
    lecture = false,
    onPollSettled = savePollResult,
  }: GameOptions) {
    const clientId = socket.handshake.auth.clientId as string

    this.io = io
    this.gameId = uuid()
    this.inviteCode = createInviteCode(
      (code) => registry.getGameByInviteCode(code) !== undefined,
    )
    this.visuals = visuals
    this.lecture = lecture
    this._manager = {
      id: socket.id,
      clientId,
      connected: true,
    }

    this.cooldown = new CooldownTimer(io, this.gameId)

    this.playerManager = new PlayerManager({
      io,
      gameId: this.gameId,
      isManager: this.isManager.bind(this),
      getVisuals: () => this.visuals,
    })

    this.round = new RoundManager({
      quizz,
      players: this.playerManager,
      cooldown: this.cooldown,
      io,
      gameId: this.gameId,
      getManagerId: () => this._manager.id,
      isManager: this.isManager.bind(this),
      broadcast: this.broadcastStatus.bind(this),
      send: this.sendStatus.bind(this),
      onNewQuestion: () => {
        this.playerStatus.clear()
        this.emitLectureState()
      },
      onGameFinished: (result) => {
        this.recordResult(result)
        this.emitLectureState()
      },
      lecture,
    })

    this.poll = new PollManager({
      io,
      players: this.playerManager,
      gameSubject: quizz.subject,
      getManagerId: () => this._manager.id,
      isManager: this.isManager.bind(this),
      onSettled: onPollSettled,
    })

    // What a resyncing manager gets back while the game is still a lobby.
    this.managerStatus = {
      name: STATUS.SHOW_ROOM,
      data: { text: "game:waitingForPlayers", inviteCode: this.inviteCode },
    }

    socket.join(this.gameId)
    socket.emit(EVENTS.MANAGER.GAME_CREATED, {
      gameId: this.gameId,
      inviteCode: this.inviteCode,
      visuals: this.visuals,
      ...this.lecturePayload(),
    })

    console.log(
      `New game created: ${this.inviteCode} subject: ${quizz.subject}`,
    )
  }

  get manager() {
    return this._manager
  }

  // Only the socket attached as manager may run the game; one that left
  // must reconnect first.
  private isManager(socket: Socket): boolean {
    return this._manager.connected && this._manager.id === socket.id
  }

  get players(): Player[] {
    return this.playerManager.getAll()
  }

  get started(): boolean {
    return this.round.isStarted()
  }

  // Players can only join before the start; afterwards only those already
  // in the game can come back, through a reconnect.
  get inLobby(): boolean {
    return this.round.isLobby()
  }

  // A lecture game also takes newcomers between questions.
  get acceptsNewPlayers(): boolean {
    return this.round.acceptsNewPlayers()
  }

  // ── Lecture state ────────────────────────────────────────────────────────

  private lectureState(): LectureState {
    return { inviteCode: this.inviteCode, ...this.round.getLectureProgress() }
  }

  // Only a lecture game tells its host which questions have run.
  private lecturePayload(): { lecture?: LectureState } {
    return this.lecture ? { lecture: this.lectureState() } : {}
  }

  private emitLectureState() {
    if (!this.lecture || !this._manager.connected) {
      return
    }

    this.io
      .to(this._manager.id)
      .emit(EVENTS.MANAGER.LECTURE_STATE, this.lectureState())
  }

  // A game's result is written once, however it ends.
  private recordResult(result: GameResult) {
    if (this.resultSaved) {
      return
    }

    // A failed write leaves the latch open so a later call (a SIGTERM save)
    // can still try; `false` is the only failure signal.
    this.resultSaved = saveResult(result)
  }

  // Keeps the questions a lecture game played when it closes before its
  // final standings.
  saveUnfinishedLecture() {
    const result = this.round.getUnfinishedResult()

    if (result) {
      this.recordResult(result)
    }
  }

  // ── Status broadcasting ──────────────────────────────────────────────────

  private broadcastStatus<T extends Status>(status: T, data: StatusDataMap[T]) {
    const statusData = { name: status, data }
    this.lastBroadcastStatus = statusData
    // A room-wide status supersedes the manager's own (e.g. the lobby).
    this.managerStatus = null
    this.io.to(this.gameId).emit(EVENTS.GAME.STATUS, statusData)
  }

  private sendStatus<T extends Status>(
    target: string,
    status: T,
    data: StatusDataMap[T],
  ) {
    const statusData = { name: status, data }

    if (this._manager.id === target) {
      this.managerStatus = statusData

      // Kept for reconnect; the old socket may be hosting another game now.
      if (!this._manager.connected) {
        return
      }
    } else {
      this.playerStatus.set(target, statusData)

      if (!this.playerManager.findById(target)?.connected) {
        return
      }
    }

    this.io.to(target).emit(EVENTS.GAME.STATUS, statusData)
  }

  // Player actions

  join(socket: Socket, username: string) {
    const lateToLecture = this.lecture && this.started

    if (!this.acceptsNewPlayers) {
      socket.emit(
        EVENTS.GAME.ERROR_MESSAGE,
        lateToLecture
          ? "errors:game.questionInProgress"
          : "errors:game.alreadyStarted",
      )

      return
    }

    // A latecomer waits for the next question, not for players.
    const waitText = lateToLecture ? LECTURE_TEXT.NEXT_QUESTION : undefined
    const player = this.playerManager.join(socket, username, waitText)

    if (!player) {
      return
    }

    // Stored too, so a reconnect does not replay the last question's screen.
    if (waitText) {
      this.sendStatus(player.id, STATUS.WAIT, { text: waitText })
    }

    if (this._manager.connected) {
      this.io
        .to(this._manager.id)
        .emit(EVENTS.MANAGER.NEW_PLAYER, toPublicPlayer(player))
    }
  }

  // A kicked client may not come back in through the lobby or a lecture's
  // between-question window.
  isKicked(clientId: string): boolean {
    return this.playerManager.isKicked(clientId)
  }

  kickPlayer(socket: Socket, playerId: string) {
    const player = this.playerManager.findById(playerId)

    if (player && this.playerManager.kick(socket, playerId)) {
      this.playerStatus.delete(playerId)
      this.round.forgetPlayer(player.clientId)
      this.poll.forgetPlayer(player.clientId)

      // The host's "N answered" counter would still count a kicked answer.
      const answered = this.round.getAnswerCount()

      if (answered !== null) {
        this.io.to(this.gameId).emit(EVENTS.GAME.PLAYER_ANSWER, answered)
      }

      this.round.endIfEveryoneAnswered()
    }
  }

  // Reconnect

  reconnectManager(socket: Socket) {
    // The attached socket asking again just resyncs. Another socket with the
    // same clientId is the host back before the server noticed the old
    // connection died (a network change, a laptop waking), so the newest
    // connection wins.
    if (this._manager.connected && this._manager.id !== socket.id) {
      this.io
        .to(this._manager.id)
        .emit(EVENTS.GAME.RESET, "errors:game.openedElsewhere")
      this.io.in(this._manager.id).socketsLeave(this.gameId)
    }

    socket.join(this.gameId)
    this._manager.id = socket.id
    this._manager.connected = true

    const selectedStatus = selectReconnectStatus(
      this.managerStatus,
      this.lastBroadcastStatus,
    )
    const status = restampReconnectStatus(selectedStatus)

    socket.emit(EVENTS.MANAGER.SUCCESS_RECONNECT, {
      gameId: this.gameId,
      currentQuestion: this.round.getReconnectInfo(),
      status,
      players: this.playerManager.getAll().map(toPublicPlayer),
      visuals: this.visuals,
      ...this.lecturePayload(),
      ...pollPayload(this.poll.snapshotForHost()),
    })
    socket.emit(EVENTS.GAME.TOTAL_PLAYERS, this.playerManager.count())

    // The answer count only arrives as answers come in; a host back mid-
    // question would otherwise read 0 until the next one.
    const answered = this.round.getAnswerCount()

    if (answered !== null) {
      socket.emit(EVENTS.GAME.PLAYER_ANSWER, answered)
    }

    registry.reactivateGame(this.gameId)
    console.log(`Manager reconnected to game ${this.inviteCode}`)
  }

  // Routed by the event, not the clientId: a host may also play in the game
  // from another tab of the same browser.
  reconnectPlayer(socket: Socket) {
    const clientId = socket.handshake.auth.clientId as string
    const player = this.playerManager.findByClientId(clientId)

    if (!player) {
      return
    }

    if (player.connected && player.id !== socket.id) {
      // A phone that changed networks is back before the server has noticed
      // its old connection died. The newest connection wins.
      this.io
        .to(player.id)
        .emit(EVENTS.GAME.RESET, "errors:game.openedElsewhere")
      this.io.in(player.id).socketsLeave(this.gameId)
    }

    socket.join(this.gameId)

    const oldSocketId = player.id
    this.playerManager.updateSocketId(oldSocketId, socket.id)
    player.connected = true

    const selectedStatus = selectReconnectStatus(
      this.playerStatus.get(oldSocketId),
      this.lastBroadcastStatus,
    )
    const status = restampReconnectStatus(selectedStatus)

    const oldStatus = this.playerStatus.get(oldSocketId)

    if (oldStatus) {
      this.playerStatus.delete(oldSocketId)
      this.playerStatus.set(socket.id, oldStatus)
    }

    socket.emit(EVENTS.PLAYER.SUCCESS_RECONNECT, {
      gameId: this.gameId,
      currentQuestion: this.round.getReconnectInfo(),
      status,
      player: { username: player.username, points: player.points },
      visuals: this.visuals,
      ...pollPayload(this.poll.snapshotForPlayer(clientId)),
    })
    socket.emit(EVENTS.GAME.TOTAL_PLAYERS, this.playerManager.count())

    // The host's lobby names a seat by socket id, and this phone has a new
    // one: without this a Kick aims at the dead id and a later leave misses.
    // The host's seat for the same name takes the new id in place.
    if (this._manager.connected) {
      this.io
        .to(this._manager.id)
        .emit(EVENTS.MANAGER.NEW_PLAYER, toPublicPlayer(player))
    }

    console.log(
      `Player ${player.username} reconnected to game ${this.inviteCode}`,
    )
  }

  // Disconnect helpers

  setManagerDisconnected() {
    this._manager.connected = false
    this.io.in(this._manager.id).socketsLeave(this.gameId)
  }

  removePlayer(socketId: string): Player | undefined {
    const player = this.playerManager.remove(socketId)

    if (player) {
      this.poll.forgetPlayer(player.clientId)
      this.io.in(socketId).socketsLeave(this.gameId)

      if (this._manager.connected) {
        this.io
          .to(this._manager.id)
          .emit(EVENTS.MANAGER.REMOVE_PLAYER, player.id)
      }

      this.playerManager.broadcastCount()
    }

    return player
  }

  setPlayerDisconnected(socketId: string) {
    // No player holds that id (a stale socket): nothing to mark, announce or
    // wait out.
    if (!this.playerManager.findById(socketId)) {
      return
    }

    this.playerManager.setDisconnected(socketId)
    this.io.in(socketId).socketsLeave(this.gameId)
    this.playerManager.broadcastCount()

    // Unless they are back by then, stop holding the answers open for them.
    setTimeout(() => {
      this.round.endIfEveryoneAnswered()
    }, DROP_GRACE_MS)
  }

  // Game flow

  // Ends the game for everyone still in it, once the registry has dropped it.
  close(message: string) {
    // Before stop(): a stopped round no longer reports what was played.
    this.saveUnfinishedLecture()
    this.settlePoll()
    this.poll.stop()
    this.round.stop()
    this.io.to(this.gameId).emit(EVENTS.GAME.RESET, message)
    this.io.in(this.gameId).socketsLeave(this.gameId)
  }

  // A poll that is open or showing its result owns the room: no quiz step
  // starts or advances until the host has dismissed it.
  async start(socket: Socket) {
    if (this.poll.isActive()) {
      return
    }

    await this.round.start(socket)
  }

  selectAnswer(socket: Socket, answerId: number) {
    this.round.selectAnswer(socket, answerId)
  }

  nextRound(socket: Socket) {
    if (this.poll.isActive()) {
      return
    }

    this.round.nextQuestion(socket)
  }

  abortRound(socket: Socket) {
    this.round.abortQuestion(socket)
  }

  unlockAnswers(socket: Socket) {
    this.round.unlockAnswers(socket)
  }

  showLeaderboard(socket: Socket) {
    if (this.poll.isActive()) {
      return
    }

    this.round.showLeaderboard(socket)
  }

  playQuestion(socket: Socket, index: number): LectureOutcome {
    if (this.poll.isActive()) {
      return "busy"
    }

    const outcome = this.round.playQuestion(socket, index)

    // From the lobby the countdown runs first; the host learns the question
    // now rather than when it appears.
    if (outcome === "accepted") {
      this.emitLectureState()
    }

    return outcome
  }

  finish(socket: Socket): LectureOutcome {
    if (this.poll.isActive()) {
      return "busy"
    }

    return this.round.finish(socket)
  }

  // ── Polls ────────────────────────────────────────────────────────────────

  // A poll may take a lecture room in its lobby or between questions, and
  // only when no other poll is showing. Any trouble reading it answers
  // `notFound`, so the host's reply always arrives.
  startPoll(socket: Socket, pollId: string): PollOutcome {
    if (!this.lecture) {
      return "notLecture"
    }

    if (!this.isManager(socket)) {
      return "notManager"
    }

    if (
      this.poll.isActive() ||
      !(this.round.isLobby() || this.round.isBetweenQuestions())
    ) {
      return "busy"
    }

    try {
      return this.poll.start(socket, getPollById(pollId))
    } catch (error) {
      console.error(`Failed to start poll ${logSafe(pollId)}:`, error)

      return "notFound"
    }
  }

  closePoll(socket: Socket): PollOutcome {
    return this.poll.close(socket)
  }

  dismissPoll(socket: Socket): PollOutcome {
    return this.poll.dismiss(socket)
  }

  votePoll(socket: Socket, pollId: string, option: number): PollVoteOutcome {
    return this.poll.vote(socket, pollId, option)
  }

  // A screen that has just opened (a phone arriving after it joined, a host
  // page) has no other way to learn of a poll that began before it listened.
  // Nothing showing answers `null`, so a stale overlay clears as well.
  syncPoll(socket: Socket) {
    const snapshot = this.poll.snapshotForSocket(socket)

    if (snapshot !== undefined) {
      socket.emit(EVENTS.POLL.STATE, snapshot)
    }
  }

  // Keeps an open poll as a partial result when the room closes on it, and
  // offers a result that could not be saved once more.
  settlePoll() {
    this.poll.settlePending()
  }
}

export default Game
