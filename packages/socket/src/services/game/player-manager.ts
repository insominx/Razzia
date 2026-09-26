import { EVENTS } from "@razzia/common/constants"
import type { Player, PublicPlayer } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { ResolvedVisuals } from "@razzia/common/types/visuals"
import { usernameValidator } from "@razzia/common/validators/auth"

export const toPublicPlayer = ({
  clientId: _clientId,
  ...player
}: Player): PublicPlayer => player

// How long a round keeps waiting for a player who dropped, in case they are
// only reloading or riding out a network blip.
export const DROP_GRACE_MS = 10_000

interface PlayerManagerOptions {
  io: Server
  gameId: string
  isManager: (_socket: Socket) => boolean
  getVisuals: () => ResolvedVisuals
}

export class PlayerManager {
  private readonly io: Server
  private readonly gameId: string
  private readonly isManager: (_socket: Socket) => boolean
  private readonly getVisuals: () => ResolvedVisuals
  private players: Player[] = []
  private readonly droppedAt = new Map<string, number>()

  constructor({ io, gameId, isManager, getVisuals }: PlayerManagerOptions) {
    this.io = io
    this.gameId = gameId
    this.isManager = isManager
    this.getVisuals = getVisuals
  }

  join(socket: Socket, username: string): Player | undefined {
    const clientId = socket.handshake.auth.clientId as string

    if (this.findByClientId(clientId)) {
      socket.emit(
        EVENTS.GAME.ERROR_MESSAGE,
        "errors:game.playerAlreadyConnected",
      )

      return undefined
    }

    const result = usernameValidator.safeParse(username)

    if (result.error) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, result.error.issues[0].message)

      return undefined
    }

    socket.join(this.gameId)

    const player: Player = {
      id: socket.id,
      clientId,
      connected: true,
      username,
      points: 0,
      streak: 0,
    }

    this.players.push(player)
    this.broadcastCount()
    socket.emit(EVENTS.GAME.SUCCESS_JOIN, {
      gameId: this.gameId,
      visuals: this.getVisuals(),
    })

    return player
  }

  kick(socket: Socket, playerId: string): boolean {
    if (!this.isManager(socket)) {
      return false
    }

    const player = this.findById(playerId)

    if (!player) {
      return false
    }

    this.players = this.players.filter((p) => p.id !== playerId)

    this.io.in(playerId).socketsLeave(this.gameId)

    // A player who already left may be in another game on that socket now.
    if (player.connected) {
      this.io
        .to(player.id)
        .emit(EVENTS.GAME.RESET, "errors:game.kickedByManager")
    }

    socket.emit(EVENTS.MANAGER.PLAYER_KICKED, player.id)
    this.broadcastCount()

    return true
  }

  remove(socketId: string): Player | undefined {
    const player = this.findById(socketId)

    if (!player) {
      return undefined
    }

    this.players = this.players.filter((p) => p.id !== socketId)

    return player
  }

  setDisconnected(socketId: string): void {
    const player = this.findById(socketId)

    if (player) {
      player.connected = false
      this.droppedAt.set(player.clientId, Date.now())
    }
  }

  // Players a round still waits for: everyone connected, plus anyone who
  // dropped too recently to rule out a quick reconnect.
  getExpected(now = Date.now()): Player[] {
    return this.players.filter(
      (player) =>
        player.connected ||
        now - (this.droppedAt.get(player.clientId) ?? 0) < DROP_GRACE_MS,
    )
  }

  updateSocketId(oldId: string, newId: string): void {
    const player = this.findById(oldId)

    if (player) {
      player.id = newId
    }
  }

  replace(players: Player[]): void {
    this.players = players
  }

  findById(socketId: string): Player | undefined {
    return this.players.find((p) => p.id === socketId)
  }

  findByClientId(clientId: string): Player | undefined {
    return this.players.find((p) => p.clientId === clientId)
  }

  getAll(): Player[] {
    return this.players
  }

  count(): number {
    return this.players.length
  }

  broadcastCount(): void {
    this.io.to(this.gameId).emit(EVENTS.GAME.TOTAL_PLAYERS, this.players.length)
  }
}
