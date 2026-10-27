import { EVENTS } from "@razzia/common/constants"
import type { LectureOutcome, QuizzWithId } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { SocketContext } from "@razzia/socket/handlers/types"
import manager from "@razzia/socket/services/manager"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const game = {
    playQuestion: vi.fn((): LectureOutcome => "accepted"),
    finish: vi.fn((): LectureOutcome => "finished"),
  }
  const withGame = vi.fn(
    (
      _gameId: string | undefined,
      _socket: Socket,
      callback: (_game: typeof game) => void,
    ) => callback(game),
  )

  return {
    game,
    withGame,
    Game: vi.fn(),
    getQuizz: vi.fn((): QuizzWithId[] => []),
    registry: {
      addGame: vi.fn(),
      closeGame: vi.fn(),
      markGameAsEmpty: vi.fn(),
      getPlayerGame: vi.fn(),
      getManagerGame: vi.fn(),
      getGameByInviteCode: vi.fn(),
      getGamesByManagerSocketId: vi.fn((): unknown[] => []),
      getGamesByPlayerSocketId: vi.fn((): unknown[] => []),
    },
  }
})

vi.mock("@razzia/socket/utils/game", () => ({
  withGame: mocks.withGame,
}))

vi.mock("@razzia/socket/services/game", () => ({
  default: mocks.Game,
}))

vi.mock("@razzia/socket/services/registry", () => ({
  default: {
    getInstance: () => mocks.registry,
  },
}))

vi.mock("@razzia/socket/services/config", () => ({
  getGameConfig: vi.fn(),
  getQuizz: mocks.getQuizz,
}))

vi.mock("@razzia/socket/services/visuals", () => ({
  resolveVisuals: vi.fn(),
}))

const quiz: QuizzWithId = { id: "quiz-1", subject: "Quiz", questions: [] }

const MANAGER_CLIENT_ID = "manager-client"

const managerClient = {
  handshake: { auth: { clientId: MANAGER_CLIENT_ID } },
} as unknown as Socket

const registerHandlers = async () => {
  const handlers = new Map<string, (...args: never[]) => void>()
  const emit = vi.fn()
  const socket = {
    id: "manager",
    handshake: { auth: { clientId: MANAGER_CLIENT_ID } },
    emit,
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      handlers.set(event, handler)
    }),
  } as unknown as Socket
  const io = {} as Server
  const { gameSocketHandlers } = await import("@razzia/socket/handlers/game")

  gameSocketHandlers({ io, socket } as SocketContext)

  return { handlers, socket, emit, io }
}

const makeLectureGame = (gameId: string, started: boolean) => ({
  gameId,
  inviteCode: `${gameId}-code`,
  lecture: true,
  started,
  manager: { id: "manager", connected: true },
  setManagerDisconnected: vi.fn(),
  setPlayerDisconnected: vi.fn(),
  removePlayer: vi.fn(),
})

describe("gameSocketHandlers lecture games", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getQuizz.mockReturnValue([quiz])
    mocks.registry.getGameByInviteCode.mockReset()
    mocks.registry.getPlayerGame.mockReset()
    mocks.registry.getManagerGame.mockReset()
  })

  afterEach(() => {
    manager.logout(managerClient)
  })

  it("refuses to create a lecture game for a client that has not logged in", async () => {
    const { handlers, emit } = await registerHandlers()

    handlers.get(EVENTS.GAME.CREATE_LECTURE)?.("quiz-1" as never)

    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.UNAUTHORIZED)
    expect(mocks.Game).not.toHaveBeenCalled()
  })

  it("creates a lecture game for a logged-in manager", async () => {
    const { handlers, socket, io } = await registerHandlers()
    manager.login(socket)

    handlers.get(EVENTS.GAME.CREATE_LECTURE)?.("quiz-1" as never)

    expect(mocks.Game).toHaveBeenCalledWith({
      io,
      socket,
      quizz: quiz,
      visuals: undefined,
      lecture: true,
    })
    expect(mocks.registry.addGame).toHaveBeenCalledTimes(1)
  })

  it("answers the deck's commands through the ack", async () => {
    const { handlers, socket } = await registerHandlers()
    const playAck = vi.fn()
    const finishAck = vi.fn()

    handlers.get(EVENTS.MANAGER.PLAY_QUESTION)?.(
      { gameId: "g", index: 2 } as never,
      playAck as never,
    )
    handlers.get(EVENTS.MANAGER.FINISH_GAME)?.(
      { gameId: "g" } as never,
      finishAck as never,
    )

    expect(mocks.game.playQuestion).toHaveBeenCalledWith(socket, 2)
    expect(playAck).toHaveBeenCalledWith("accepted")
    expect(mocks.game.finish).toHaveBeenCalledWith(socket)
    expect(finishAck).toHaveBeenCalledWith("finished")
  })

  it("still runs a command sent without a usable ack", async () => {
    const { handlers } = await registerHandlers()

    expect(() => {
      handlers.get(EVENTS.MANAGER.PLAY_QUESTION)?.(
        { gameId: "g", index: 0 } as never,
        "not a callback" as never,
      )
    }).not.toThrow()
    expect(mocks.game.playQuestion).toHaveBeenCalledTimes(1)
  })

  it("keeps a lecture lobby when its host's connection drops", async () => {
    const { handlers } = await registerHandlers()
    const lobby = makeLectureGame("lobby", false)
    mocks.registry.getGamesByManagerSocketId.mockReturnValueOnce([lobby])

    handlers.get("disconnect")?.()

    expect(lobby.setManagerDisconnected).toHaveBeenCalledTimes(1)
    expect(mocks.registry.markGameAsEmpty).toHaveBeenCalledWith(lobby)
    expect(mocks.registry.closeGame).not.toHaveBeenCalled()
  })

  it("ends a lecture game when its host leaves on purpose", async () => {
    const { handlers } = await registerHandlers()
    const running = makeLectureGame("running", true)
    mocks.registry.getManagerGame.mockReturnValueOnce(running)

    handlers.get(EVENTS.MANAGER.LEAVE)?.({ gameId: "running" } as never)

    expect(mocks.registry.closeGame).toHaveBeenCalledWith(
      running,
      "errors:game.managerDisconnected",
    )
    expect(mocks.registry.markGameAsEmpty).not.toHaveBeenCalled()
  })

  it("keeps a lecture lobby player whose phone dropped", async () => {
    const { handlers, socket } = await registerHandlers()
    const lobby = makeLectureGame("lobby", false)
    mocks.registry.getGamesByPlayerSocketId.mockReturnValueOnce([lobby])

    handlers.get("disconnect")?.()

    expect(lobby.setPlayerDisconnected).toHaveBeenCalledWith(socket.id)
    expect(lobby.removePlayer).not.toHaveBeenCalled()
  })

  it("removes a lecture lobby player who leaves on purpose", async () => {
    const { handlers, socket } = await registerHandlers()
    const lobby = makeLectureGame("lobby", false)
    mocks.registry.getPlayerGame.mockReturnValueOnce(lobby)

    handlers.get(EVENTS.PLAYER.LEAVE)?.({ gameId: "lobby" } as never)

    expect(lobby.removePlayer).toHaveBeenCalledWith(socket.id)
    expect(lobby.setPlayerDisconnected).not.toHaveBeenCalled()
  })
})

describe("gameSocketHandlers joining a lecture game", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.registry.getGameByInviteCode.mockReset()
    mocks.registry.getPlayerGame.mockReset()
  })

  const joinWithPin = async (game: {
    gameId: string
    started: boolean
    acceptsNewPlayers: boolean
  }) => {
    const { handlers, emit } = await registerHandlers()
    mocks.registry.getGameByInviteCode.mockReturnValueOnce({
      ...game,
      lecture: true,
      inLobby: !game.started,
    })

    handlers.get(EVENTS.PLAYER.JOIN)?.("123456" as never)

    return emit
  }

  it("sends a member back in any phase", async () => {
    mocks.registry.getPlayerGame.mockReturnValueOnce({ gameId: "lecture" })
    const emit = await joinWithPin({
      gameId: "lecture",
      started: true,
      acceptsNewPlayers: false,
    })

    expect(emit).toHaveBeenCalledWith(EVENTS.GAME.SUCCESS_REJOIN, "lecture")
  })

  it("lets a newcomer in between questions", async () => {
    const emit = await joinWithPin({
      gameId: "lecture",
      started: true,
      acceptsNewPlayers: true,
    })

    expect(emit).toHaveBeenCalledWith(EVENTS.GAME.SUCCESS_ROOM, "lecture")
  })

  it("turns a newcomer away during a question", async () => {
    const emit = await joinWithPin({
      gameId: "lecture",
      started: true,
      acceptsNewPlayers: false,
    })

    expect(emit).toHaveBeenCalledWith(
      EVENTS.GAME.ERROR_MESSAGE,
      "errors:game.questionInProgress",
    )
    expect(emit).not.toHaveBeenCalledWith(
      EVENTS.GAME.SUCCESS_ROOM,
      expect.anything(),
    )
  })
})
