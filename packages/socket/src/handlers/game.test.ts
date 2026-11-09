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

const registerHandlers = async (
  clientId: string = MANAGER_CLIENT_ID,
  address?: string,
) => {
  const handlers = new Map<string, (...args: never[]) => void>()
  const emit = vi.fn()
  const socket = {
    id: "manager",
    handshake: { auth: { clientId }, address },
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

  afterEach(() => {
    manager.logout(managerClient)
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

const makeManagedGame = (
  gameId: string,
  started: boolean,
  managerSocketId = "manager",
) => ({
  gameId,
  inviteCode: `${gameId}-code`,
  started,
  manager: { id: managerSocketId, connected: true },
  setManagerDisconnected: vi.fn(),
})

describe("gameSocketHandlers manager socket lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getQuizz.mockReturnValue([quiz])
  })

  afterEach(() => {
    manager.logout(managerClient)
  })

  it("releases every game the manager socket runs when it disconnects", async () => {
    const { handlers } = await registerHandlers()
    const lobby = makeManagedGame("lobby", false)
    const running = makeManagedGame("running", true)
    mocks.registry.getGamesByManagerSocketId.mockReturnValueOnce([
      running,
      lobby,
    ])

    handlers.get("disconnect")?.()

    expect(running.setManagerDisconnected).toHaveBeenCalledTimes(1)
    expect(lobby.setManagerDisconnected).toHaveBeenCalledTimes(1)
    // A drop is never the host's own Exit: lobby and game both wait.
    expect(mocks.registry.markGameAsEmpty).toHaveBeenCalledTimes(2)
    expect(mocks.registry.markGameAsEmpty).toHaveBeenCalledWith(running)
    expect(mocks.registry.markGameAsEmpty).toHaveBeenCalledWith(lobby)
    expect(mocks.registry.closeGame).not.toHaveBeenCalled()
  })

  it("ignores a leave from a manager tab that is not running the game", async () => {
    const { handlers } = await registerHandlers()
    const hosted = makeManagedGame("hosted", false, "other-tab")
    mocks.registry.getManagerGame.mockReturnValueOnce(hosted)

    handlers.get(EVENTS.MANAGER.LEAVE)?.({ gameId: "hosted" } as never)

    expect(hosted.setManagerDisconnected).not.toHaveBeenCalled()
    expect(mocks.registry.closeGame).not.toHaveBeenCalled()
  })

  it("releases the game when its own manager tab leaves", async () => {
    const { handlers } = await registerHandlers()
    const hosted = makeManagedGame("hosted", false)
    mocks.registry.getManagerGame.mockReturnValueOnce(hosted)

    handlers.get(EVENTS.MANAGER.LEAVE)?.({ gameId: "hosted" } as never)

    expect(hosted.setManagerDisconnected).toHaveBeenCalledTimes(1)
    expect(mocks.registry.closeGame).toHaveBeenCalledWith(
      hosted,
      "errors:game.managerDisconnected",
    )
  })

  it("marks the player gone in every game that socket plays in", async () => {
    const { handlers, socket } = await registerHandlers()
    const left = {
      gameId: "left",
      started: true,
      setPlayerDisconnected: vi.fn(),
    }
    const current = {
      gameId: "current",
      started: true,
      setPlayerDisconnected: vi.fn(),
    }
    mocks.registry.getGamesByPlayerSocketId.mockReturnValueOnce([left, current])

    handlers.get("disconnect")?.()

    expect(left.setPlayerDisconnected).toHaveBeenCalledWith(socket.id)
    expect(current.setPlayerDisconnected).toHaveBeenCalledWith(socket.id)
  })
})

describe("gameSocketHandlers joining", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Vitest keeps queued one-shot values through clearAllMocks; drop leftovers.
    mocks.registry.getGameByInviteCode.mockReset()
    mocks.registry.getPlayerGame.mockReset()
    mocks.registry.getManagerGame.mockReset()
  })

  const joinWithPin = async (game: { gameId: string; inLobby: boolean }) => {
    const { handlers, emit, socket } = await registerHandlers()
    mocks.registry.getGameByInviteCode.mockReturnValueOnce({
      isKicked: () => false,
      ...game,
    })

    handlers.get(EVENTS.PLAYER.JOIN)?.("123456" as never)

    return { emit, socket }
  }

  it("opens the lobby to anyone with the PIN", async () => {
    const { emit } = await joinWithPin({ gameId: "lobby", inLobby: true })

    expect(emit).toHaveBeenCalledWith(EVENTS.GAME.SUCCESS_ROOM, "lobby")
  })

  it("turns away a new player once the game has started", async () => {
    mocks.registry.getPlayerGame.mockReturnValueOnce(undefined)
    const { emit } = await joinWithPin({ gameId: "running", inLobby: false })

    expect(emit).toHaveBeenCalledWith(
      EVENTS.GAME.ERROR_MESSAGE,
      "errors:game.alreadyStarted",
    )
    expect(emit).not.toHaveBeenCalledWith(
      EVENTS.GAME.SUCCESS_ROOM,
      expect.anything(),
    )
  })

  it("sends a player who was already in the game straight back to it", async () => {
    const running = { gameId: "running", inLobby: false }
    mocks.registry.getPlayerGame.mockReturnValueOnce(running)
    const { emit } = await joinWithPin(running)

    expect(mocks.registry.getPlayerGame).toHaveBeenCalledWith(
      "running",
      MANAGER_CLIENT_ID,
    )
    expect(emit).toHaveBeenCalledWith(EVENTS.GAME.SUCCESS_REJOIN, "running")
  })

  it("reconnects as a player or as the manager by the event it came on", async () => {
    const { handlers, socket } = await registerHandlers()
    manager.login(socket)
    const game = { reconnectPlayer: vi.fn(), reconnectManager: vi.fn() }
    mocks.registry.getPlayerGame.mockReturnValueOnce(game)
    mocks.registry.getManagerGame.mockReturnValueOnce(game)

    handlers.get(EVENTS.PLAYER.RECONNECT)?.({ gameId: "g" } as never)
    expect(game.reconnectPlayer).toHaveBeenCalledWith(socket)
    expect(game.reconnectManager).not.toHaveBeenCalled()

    handlers.get(EVENTS.MANAGER.RECONNECT)?.({ gameId: "g" } as never)
    expect(game.reconnectManager).toHaveBeenCalledWith(socket)
  })
})

describe("gameSocketHandlers hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.registry.getGameByInviteCode.mockReset()
    mocks.registry.getPlayerGame.mockReset()
    mocks.registry.getManagerGame.mockReset()
    mocks.getQuizz.mockReturnValue([quiz])
  })

  afterEach(() => {
    manager.logout(managerClient)
  })

  it("keeps a finished game's players and host through a drop", async () => {
    const { handlers } = await registerHandlers()
    // A finished game reports neither started nor in its lobby.
    const podium = {
      ...makeManagedGame("podium", false),
      inLobby: false,
      setPlayerDisconnected: vi.fn(),
      removePlayer: vi.fn(),
    }
    mocks.registry.getGamesByManagerSocketId.mockReturnValueOnce([podium])
    mocks.registry.getGamesByPlayerSocketId.mockReturnValueOnce([podium])

    handlers.get("disconnect")?.()

    expect(mocks.registry.closeGame).not.toHaveBeenCalled()
    expect(mocks.registry.markGameAsEmpty).toHaveBeenCalledWith(podium)
    expect(podium.removePlayer).not.toHaveBeenCalled()
    expect(podium.setPlayerDisconnected).toHaveBeenCalledWith("manager")
  })

  it("names a leaving player by the id they hold, not by the sending socket", async () => {
    const { handlers } = await registerHandlers()
    const lobby = {
      ...makeManagedGame("lobby", false),
      inLobby: true,
      lecture: false,
      players: [{ id: "old-socket", clientId: MANAGER_CLIENT_ID }],
      removePlayer: vi.fn(),
      setPlayerDisconnected: vi.fn(),
    }
    mocks.registry.getPlayerGame.mockReturnValueOnce(lobby)

    handlers.get(EVENTS.PLAYER.LEAVE)?.({ gameId: "lobby" } as never)

    expect(lobby.removePlayer).toHaveBeenCalledWith("old-socket")
  })

  it("refuses a manager reconnect from a client that logged out", async () => {
    const { handlers, emit } = await registerHandlers()
    const game = { reconnectManager: vi.fn() }
    mocks.registry.getManagerGame.mockReturnValue(game)

    handlers.get(EVENTS.MANAGER.RECONNECT)?.({ gameId: "g" } as never)

    expect(game.reconnectManager).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.UNAUTHORIZED)
  })

  it("answers a host whose config cannot be read instead of throwing", async () => {
    const { handlers, socket, emit } = await registerHandlers()
    manager.login(socket)
    const { getGameConfig } = await import("@razzia/socket/services/config")
    vi.mocked(getGameConfig).mockImplementationOnce(() => {
      throw new SyntaxError("Unexpected end of JSON input")
    })
    vi.mocked(mocks.getQuizz).mockReturnValue([quiz])
    const { resolveVisuals } = await import("@razzia/socket/services/visuals")
    vi.mocked(resolveVisuals).mockImplementationOnce(() => ({}))

    expect(() =>
      handlers.get(EVENTS.GAME.CREATE)?.("quiz-1" as never),
    ).not.toThrow()
    expect(mocks.Game).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(
      EVENTS.GAME.ERROR_MESSAGE,
      "errors:manager.failedToReadConfig",
    )
  })

  it("slows down a client sweeping invite codes", async () => {
    const { handlers, emit } = await registerHandlers()
    mocks.registry.getGameByInviteCode.mockReturnValue(undefined)

    for (let i = 0; i < 40; i += 1) {
      handlers.get(EVENTS.PLAYER.JOIN)?.(String(100000 + i) as never)
    }

    expect(emit).toHaveBeenLastCalledWith(
      EVENTS.GAME.ERROR_MESSAGE,
      "errors:manager.tooManyAttempts",
    )
  })

  it("lets a whole class sharing one address mistype codes, and one student's sweep never blocks another", async () => {
    mocks.registry.getGameByInviteCode.mockReturnValue(undefined)

    // 60 students on one address, three typos each.
    await Promise.all(
      Array.from({ length: 60 }, async (_, student) => {
        const { handlers } = await registerHandlers(
          `student-${student}-client-id`,
          "192.168.7.7",
        )

        for (let typo = 0; typo < 3; typo += 1) {
          handlers.get(EVENTS.PLAYER.JOIN)?.(String(200000 + typo) as never)
        }
      }),
    )

    // One student sweeping codes is locked out alone.
    const sweeper = await registerHandlers("sweeper-client-id", "192.168.7.7")

    for (let guess = 0; guess < 12; guess += 1) {
      sweeper.handlers.get(EVENTS.PLAYER.JOIN)?.(
        String(400000 + guess) as never,
      )
    }

    expect(sweeper.emit).toHaveBeenLastCalledWith(
      EVENTS.GAME.ERROR_MESSAGE,
      "errors:manager.tooManyAttempts",
    )

    const late = await registerHandlers("late-student-client-id", "192.168.7.7")
    late.handlers.get(EVENTS.PLAYER.JOIN)?.("200000" as never)

    expect(late.emit).toHaveBeenLastCalledWith(
      EVENTS.GAME.ERROR_MESSAGE,
      "errors:game.notFound",
    )
  })
})
