import { EVENTS } from "@razzia/common/constants"
import { inviteCodeValidator } from "@razzia/common/validators/auth"
import {
  ackOf,
  fieldsOf,
  gameIdOf,
  numberOf,
  textOf,
} from "@razzia/socket/handlers/payload"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { getGameConfig, getQuizz } from "@razzia/socket/services/config"
import { inviteThrottle } from "@razzia/socket/services/auth-throttle"
import Game from "@razzia/socket/services/game"
import manager from "@razzia/socket/services/manager"
import Registry from "@razzia/socket/services/registry"
import { resolveVisuals } from "@razzia/socket/services/visuals"
import { withGame } from "@razzia/socket/utils/game"
import { logSafe } from "@razzia/socket/utils/safe"

export const gameSocketHandlers = ({ io, socket }: SocketContext) => {
  const registry = Registry.getInstance()
  const clientId = socket.handshake.auth.clientId as string

  // Only the host's own Exit ends a game at once. A dropped host (a Wi-Fi
  // blip, a reload, a sleeping laptop) leaves the lobby, the running game or
  // the podium waiting for its manager to reconnect before it expires.
  const handleManagerLeave = (game: Game, explicit: boolean) => {
    game.setManagerDisconnected()

    if (explicit) {
      registry.closeGame(game, "errors:game.managerDisconnected")

      return
    }

    registry.markGameAsEmpty(game)
  }

  // A lecture lobby keeps a player whose phone dropped; leaving on purpose
  // still removes them.
  // Only the lobby forgets a player; a finished game keeps its podium for a
  // phone that wakes up later. The player is named by the id they hold now,
  // which a socket that has not reconnected yet does not own.
  const handlePlayerLeave = (
    game: Game,
    explicit: boolean,
    playerId: string,
  ) => {
    if (game.inLobby && (!game.lecture || explicit)) {
      const player = game.removePlayer(playerId)

      if (player) {
        console.log(
          `Player ${logSafe(player.username)} left game ${game.gameId}`,
        )
      }

      return
    }

    game.setPlayerDisconnected(playerId)
  }

  socket.on(EVENTS.PLAYER.RECONNECT, (message) => {
    const gameId = gameIdOf(message)

    if (!gameId) {
      return
    }

    const game = registry.getPlayerGame(gameId, clientId)

    if (game) {
      game.reconnectPlayer(socket)

      return
    }

    socket.emit(EVENTS.GAME.RESET, "errors:game.notFound")
  })

  socket.on(EVENTS.MANAGER.RECONNECT, (message) => {
    const gameId = gameIdOf(message)

    if (!gameId) {
      return
    }

    // A manager who logged out must log in again before taking a game back.
    if (!manager.isLogged(socket)) {
      socket.emit(EVENTS.MANAGER.UNAUTHORIZED)

      return
    }

    const game = registry.getManagerGame(gameId, clientId)

    if (game) {
      game.reconnectManager(socket)

      return
    }

    socket.emit(EVENTS.GAME.RESET, "errors:game.expired")
  })

  const createGame = (quizzId: string, mode: { lecture?: true } = {}) => {
    const failedToRead = (label: string, error: unknown) => {
      console.error(label, error)
      socket.emit(
        EVENTS.GAME.ERROR_MESSAGE,
        "errors:manager.failedToReadConfig",
      )
    }

    const found = (() => {
      try {
        return { quizz: getQuizz().find((q) => q.id === quizzId) }
      } catch (error) {
        failedToRead("Failed to read quizzes:", error)

        return null
      }
    })()

    if (!found) {
      return
    }

    const { quizz } = found

    if (!quizz) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:quizz.notFound")

      return
    }

    // An unreadable config answers the host instead of escaping the handler.
    const resolved = (() => {
      try {
        return { visuals: resolveVisuals(quizz, getGameConfig()) }
      } catch (error) {
        failedToRead("Failed to read game config:", error)

        return null
      }
    })()

    if (!resolved) {
      return
    }

    const { visuals } = resolved

    const game = new Game({ io, socket, quizz, visuals, ...mode })
    registry.addGame(game)
  }

  socket.on(
    EVENTS.GAME.CREATE,
    manager.withAuth(socket, (quizzId) => {
      createGame(quizzId)
    }),
  )

  socket.on(
    EVENTS.GAME.CREATE_LECTURE,
    manager.withAuth(socket, (quizzId) => {
      createGame(quizzId, { lecture: true })
    }),
  )

  socket.on(EVENTS.PLAYER.JOIN, (inviteCode) => {
    const result = inviteCodeValidator.safeParse(inviteCode)

    if (result.error) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, result.error.issues[0].message)

      return
    }

    // Six digits are few: a client sweeping codes is slowed down. Only per
    // client: a class shares one address, so an address limit would let one
    // student keep everyone else out.
    const clientKeys = [`client:${clientId}`]

    if (inviteThrottle.retryAfter(clientKeys) > 0) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:manager.tooManyAttempts")

      return
    }

    const game = registry.getGameByInviteCode(inviteCode)

    if (!game) {
      inviteThrottle.fail(clientKeys)
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.notFound")

      return
    }

    if (game.isKicked(clientId)) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.kickedByManager")

      return
    }

    // A lecture game takes its members back in any phase, and newcomers
    // between questions.
    if (game.lecture) {
      if (registry.getPlayerGame(game.gameId, clientId)) {
        socket.emit(EVENTS.GAME.SUCCESS_REJOIN, game.gameId)

        return
      }

      if (!game.acceptsNewPlayers) {
        socket.emit(
          EVENTS.GAME.ERROR_MESSAGE,
          game.started
            ? "errors:game.questionInProgress"
            : "errors:game.alreadyStarted",
        )

        return
      }

      socket.emit(EVENTS.GAME.SUCCESS_ROOM, game.gameId)

      return
    }

    if (!game.inLobby) {
      // Once started, only players already in the game may come back.
      if (registry.getPlayerGame(game.gameId, clientId)) {
        socket.emit(EVENTS.GAME.SUCCESS_REJOIN, game.gameId)
      } else {
        socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.alreadyStarted")
      }

      return
    }

    socket.emit(EVENTS.GAME.SUCCESS_ROOM, game.gameId)
  })

  socket.on(EVENTS.PLAYER.LOGIN, (message) => {
    const { gameId, data } = fieldsOf(message)
    const username = textOf(fieldsOf(data).username)

    if (username === undefined) {
      return
    }

    withGame(textOf(gameId), socket, (game) => game.join(socket, username))
  })

  socket.on(EVENTS.MANAGER.KICK_PLAYER, (message) => {
    const playerId = textOf(fieldsOf(message).playerId)

    if (playerId === undefined) {
      return
    }

    withGame(gameIdOf(message), socket, (game) =>
      game.kickPlayer(socket, playerId),
    )
  })

  socket.on(EVENTS.MANAGER.START_GAME, (message) =>
    withGame(gameIdOf(message), socket, (game) => game.start(socket)),
  )

  socket.on(EVENTS.PLAYER.SELECTED_ANSWER, (message) => {
    const answerKey = numberOf(fieldsOf(fieldsOf(message).data).answerKey)

    if (answerKey === undefined) {
      return
    }

    withGame(gameIdOf(message), socket, (game) =>
      game.selectAnswer(socket, answerKey),
    )
  })

  socket.on(EVENTS.MANAGER.ABORT_QUIZ, (message) =>
    withGame(gameIdOf(message), socket, (game) => game.abortRound(socket)),
  )

  socket.on(EVENTS.MANAGER.UNLOCK_ANSWERS, (message) =>
    withGame(gameIdOf(message), socket, (game) => game.unlockAnswers(socket)),
  )

  socket.on(EVENTS.MANAGER.NEXT_QUESTION, (message) =>
    withGame(gameIdOf(message), socket, (game) => game.nextRound(socket)),
  )

  socket.on(EVENTS.MANAGER.SHOW_LEADERBOARD, (message) =>
    withGame(gameIdOf(message), socket, (game) => game.showLeaderboard(socket)),
  )

  // The deck's lecture commands answer with their outcome. Any client can
  // leave the ack out, whatever the types say.
  socket.on(EVENTS.MANAGER.PLAY_QUESTION, (message, ack) =>
    withGame(gameIdOf(message), socket, (game) => {
      // Anything but a number is no index, which the game turns down.
      const index = numberOf(fieldsOf(message).index) ?? Number.NaN
      const outcome = game.playQuestion(socket, index)

      ackOf(ack)?.(outcome)
    }),
  )

  socket.on(EVENTS.MANAGER.FINISH_GAME, (message, ack) =>
    withGame(gameIdOf(message), socket, (game) => {
      const outcome = game.finish(socket)

      ackOf(ack)?.(outcome)
    }),
  )

  socket.on(EVENTS.MANAGER.LEAVE, (message) => {
    const gameId = gameIdOf(message)

    if (!gameId) {
      return
    }

    const game = registry.getManagerGame(gameId, clientId)

    // Another tab of the same manager may leave a game it never ran.
    if (game?.manager.id === socket.id) {
      console.log(`Manager left game ${game.inviteCode}`)
      handleManagerLeave(game, true)
    }
  })

  socket.on(EVENTS.PLAYER.LEAVE, (message) => {
    const gameId = gameIdOf(message)

    if (!gameId) {
      return
    }

    const game = registry.getPlayerGame(gameId, clientId)

    const player = game?.players.find((p) => p.clientId === clientId)

    if (game && player) {
      handlePlayerLeave(game, true, player.id)
    }
  })

  socket.on("disconnect", () => {
    console.log(`A user disconnected : ${socket.id}`)

    registry.getGamesByManagerSocketId(socket.id).forEach((game) => {
      console.log(`Manager disconnected from game ${game.inviteCode}`)
      handleManagerLeave(game, false)
    })

    // A socket stays a (disconnected) player of any started game it left.
    registry.getGamesByPlayerSocketId(socket.id).forEach((game) => {
      handlePlayerLeave(game, false, socket.id)
    })
  })
}
