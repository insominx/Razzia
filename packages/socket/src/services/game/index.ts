import { EVENTS } from "@razzia/common/constants"
import type { Player, Quizz } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import type { ResolvedVisuals } from "@razzia/common/types/visuals"
import { saveResult } from "@razzia/socket/services/config"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import {
  DROP_GRACE_MS,
  PlayerManager,
  toPublicPlayer,
} from "@razzia/socket/services/game/player-manager"
import { RoundManager } from "@razzia/socket/services/game/round-manager"
import Registry from "@razzia/socket/services/registry"
import { createInviteCode } from "@razzia/socket/utils/game"
import { v7 as uuid } from "uuid"

const registry = Registry.getInstance()

interface GameOptions {
  io: Server
  socket: Socket
  quizz: Quizz
  visuals: ResolvedVisuals
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
    status.name !== STATUS.SHOW_QUESTION
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

class Game {
  readonly gameId: string
  readonly inviteCode: string
  readonly visuals: ResolvedVisuals

  private readonly io: Server
  private readonly _manager: {
    id: string
    clientId: string
    connected: boolean
  }
  private readonly playerManager: PlayerManager
  private readonly round: RoundManager
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

  constructor({ io, socket, quizz, visuals }: GameOptions) {
    const clientId = socket.handshake.auth.clientId as string

    this.io = io
    this.gameId = uuid()
    this.inviteCode = createInviteCode(
      (code) => registry.getGameByInviteCode(code) !== undefined,
    )
    this.visuals = visuals
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
      },
      onGameFinished: saveResult,
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
    if (!this.inLobby) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.alreadyStarted")

      return
    }

    const player = this.playerManager.join(socket, username)

    if (player && this._manager.connected) {
      this.io
        .to(this._manager.id)
        .emit(EVENTS.MANAGER.NEW_PLAYER, toPublicPlayer(player))
    }
  }

  kickPlayer(socket: Socket, playerId: string) {
    if (this.playerManager.kick(socket, playerId)) {
      this.playerStatus.delete(playerId)
      this.round.endIfEveryoneAnswered()
    }
  }

  // Reconnect

  reconnectManager(socket: Socket) {
    // The attached socket asking again just resyncs; only another tab is
    // refused.
    if (this._manager.connected && this._manager.id !== socket.id) {
      socket.emit(EVENTS.GAME.RESET, "errors:game.managerAlreadyConnected")

      return
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
    })
    socket.emit(EVENTS.GAME.TOTAL_PLAYERS, this.playerManager.count())

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
      socket.emit(EVENTS.GAME.RESET, "errors:game.playerAlreadyConnected")

      return
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
    })
    socket.emit(EVENTS.GAME.TOTAL_PLAYERS, this.playerManager.count())

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
    this.round.stop()
    this.io.to(this.gameId).emit(EVENTS.GAME.RESET, message)
    this.io.in(this.gameId).socketsLeave(this.gameId)
  }

  async start(socket: Socket) {
    await this.round.start(socket)
  }

  selectAnswer(socket: Socket, answerId: number) {
    this.round.selectAnswer(socket, answerId)
  }

  nextRound(socket: Socket) {
    this.round.nextQuestion(socket)
  }

  abortRound(socket: Socket) {
    this.round.abortQuestion(socket)
  }

  unlockAnswers(socket: Socket) {
    this.round.unlockAnswers(socket)
  }

  showLeaderboard(socket: Socket) {
    this.round.showLeaderboard(socket)
  }
}

export default Game
