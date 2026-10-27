import { EVENTS } from "@razzia/common/constants"
import { inviteCodeValidator } from "@razzia/common/validators/auth"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { getGameConfig, getQuizz } from "@razzia/socket/services/config"
import Game from "@razzia/socket/services/game"
import manager from "@razzia/socket/services/manager"
import Registry from "@razzia/socket/services/registry"
import { resolveVisuals } from "@razzia/socket/services/visuals"
import { withGame } from "@razzia/socket/utils/game"

export const gameSocketHandlers = ({ io, socket }: SocketContext) => {
  const registry = Registry.getInstance()
  const clientId = socket.handshake.auth.clientId as string

  // A lecture game outlives a dropped host, lobby included, so a deck reload
  // never strands the room; only the host's own Exit ends it at once.
  const handleManagerLeave = (game: Game, explicit: boolean) => {
    game.setManagerDisconnected()

    const closeNow = game.lecture ? explicit : !game.started

    if (closeNow) {
      registry.closeGame(game, "errors:game.managerDisconnected")

      return
    }

    // A running game waits for its manager to reconnect before expiring.
    registry.markGameAsEmpty(game)
  }

  // A lecture lobby keeps a player whose phone dropped; leaving on purpose
  // still removes them.
  const handlePlayerLeave = (game: Game, explicit: boolean) => {
    if (!game.started && (!game.lecture || explicit)) {
      const player = game.removePlayer(socket.id)

      if (player) {
        console.log(`Player ${player.username} left game ${game.gameId}`)
      }

      return
    }

    game.setPlayerDisconnected(socket.id)
  }

  socket.on(EVENTS.PLAYER.RECONNECT, ({ gameId }) => {
    const game = registry.getPlayerGame(gameId, clientId)

    if (game) {
      game.reconnectPlayer(socket)

      return
    }

    socket.emit(EVENTS.GAME.RESET, "errors:game.notFound")
  })

  socket.on(EVENTS.MANAGER.RECONNECT, ({ gameId }) => {
    const game = registry.getManagerGame(gameId, clientId)

    if (game) {
      game.reconnectManager(socket)

      return
    }

    socket.emit(EVENTS.GAME.RESET, "errors:game.expired")
  })

  const createGame = (quizzId: string, mode: { lecture?: true } = {}) => {
    const quizzList = getQuizz()
    const quizz = quizzList.find((q) => q.id === quizzId)

    if (!quizz) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:quizz.notFound")

      return
    }

    const visuals = resolveVisuals(quizz, getGameConfig())
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

    const game = registry.getGameByInviteCode(inviteCode)

    if (!game) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.notFound")

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

  socket.on(EVENTS.PLAYER.LOGIN, ({ gameId, data }) =>
    withGame(gameId, socket, (game) => game.join(socket, data.username)),
  )

  socket.on(EVENTS.MANAGER.KICK_PLAYER, ({ gameId, playerId }) =>
    withGame(gameId, socket, (game) => game.kickPlayer(socket, playerId)),
  )

  socket.on(EVENTS.MANAGER.START_GAME, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.start(socket)),
  )

  socket.on(EVENTS.PLAYER.SELECTED_ANSWER, ({ gameId, data }) =>
    withGame(gameId, socket, (game) =>
      game.selectAnswer(socket, data.answerKey),
    ),
  )

  socket.on(EVENTS.MANAGER.ABORT_QUIZ, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.abortRound(socket)),
  )

  socket.on(EVENTS.MANAGER.UNLOCK_ANSWERS, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.unlockAnswers(socket)),
  )

  socket.on(EVENTS.MANAGER.NEXT_QUESTION, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.nextRound(socket)),
  )

  socket.on(EVENTS.MANAGER.SHOW_LEADERBOARD, ({ gameId }) =>
    withGame(gameId, socket, (game) => game.showLeaderboard(socket)),
  )

  // The deck's lecture commands answer with their outcome. Any client can
  // leave the ack out, whatever the types say.
  socket.on(EVENTS.MANAGER.PLAY_QUESTION, ({ gameId, index }, ack) =>
    withGame(gameId, socket, (game) => {
      const outcome = game.playQuestion(socket, index)

      // oxlint-disable-next-line typescript/no-unnecessary-condition
      if (typeof ack === "function") {
        ack(outcome)
      }
    }),
  )

  socket.on(EVENTS.MANAGER.FINISH_GAME, ({ gameId }, ack) =>
    withGame(gameId, socket, (game) => {
      const outcome = game.finish(socket)

      // oxlint-disable-next-line typescript/no-unnecessary-condition
      if (typeof ack === "function") {
        ack(outcome)
      }
    }),
  )

  socket.on(EVENTS.MANAGER.LEAVE, ({ gameId }) => {
    const game = registry.getManagerGame(gameId, clientId)

    // Another tab of the same manager may leave a game it never ran.
    if (game?.manager.id === socket.id) {
      console.log(`Manager left game ${game.inviteCode}`)
      handleManagerLeave(game, true)
    }
  })

  socket.on(EVENTS.PLAYER.LEAVE, ({ gameId }) => {
    const game = registry.getPlayerGame(gameId, clientId)

    if (game) {
      handlePlayerLeave(game, true)
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
      handlePlayerLeave(game, false)
    })
  })
}
