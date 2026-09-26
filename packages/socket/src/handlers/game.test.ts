import { EVENTS } from "@razzia/common/constants"
import type { QuizzWithId } from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { SocketContext } from "@razzia/socket/handlers/types"
import manager from "@razzia/socket/services/manager"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const game = { unlockAnswers: vi.fn(), showLeaderboard: vi.fn() }
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
      getPlayerGame: vi.fn(),
      getManagerGame: vi.fn(),
      getGameByInviteCode: vi.fn(),
      getGameByManagerSocketId: vi.fn(),
      getGameByPlayerSocketId: vi.fn(),
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

const registerHandlers = async () => {
  const handlers = new Map<string, (...args: never[]) => void>()
  const emit = vi.fn()
  const socket = {
    id: "manager",
    handshake: { auth: { clientId: "manager-client" } },
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

describe("gameSocketHandlers manager answer unlock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("registers the typed event and forwards it to the game boundary", async () => {
    const { handlers, socket } = await registerHandlers()
    const handler = handlers.get(EVENTS.MANAGER.UNLOCK_ANSWERS)
    expect(handler).toBeTypeOf("function")

    handler?.({ gameId: "game-1" } as never)

    expect(mocks.withGame).toHaveBeenCalledWith(
      "game-1",
      socket,
      expect.any(Function),
    )
    expect(mocks.game.unlockAnswers).toHaveBeenCalledWith(socket)
  })

  it("passes the caller's socket to the leaderboard so the game can check it", async () => {
    const { handlers, socket } = await registerHandlers()

    handlers.get(EVENTS.MANAGER.SHOW_LEADERBOARD)?.({
      gameId: "game-1",
    } as never)

    expect(mocks.game.showLeaderboard).toHaveBeenCalledWith(socket)
  })
})

describe("gameSocketHandlers game creation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getQuizz.mockReturnValue([quiz])
  })

  afterEach(async () => {
    const { socket } = await registerHandlers()
    manager.logout(socket)
  })

  it("refuses to create a game for a client that has not logged in", async () => {
    const { handlers, emit } = await registerHandlers()

    handlers.get(EVENTS.GAME.CREATE)?.("quiz-1" as never)

    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.UNAUTHORIZED)
    expect(mocks.Game).not.toHaveBeenCalled()
    expect(mocks.registry.addGame).not.toHaveBeenCalled()
  })

  it("creates and registers a game for a logged-in manager", async () => {
    const { handlers, socket, io } = await registerHandlers()
    manager.login(socket)

    handlers.get(EVENTS.GAME.CREATE)?.("quiz-1" as never)

    expect(mocks.Game).toHaveBeenCalledTimes(1)
    expect(mocks.Game).toHaveBeenCalledWith({
      io,
      socket,
      quizz: quiz,
      visuals: undefined,
    })
    expect(mocks.registry.addGame).toHaveBeenCalledWith(
      mocks.Game.mock.instances[0],
    )
  })
})
