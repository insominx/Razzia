import { EVENTS } from "@razzia/common/constants"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const game = { unlockAnswers: vi.fn() }
  const withGame = vi.fn(
    (
      _gameId: string | undefined,
      _socket: Socket,
      callback: (_game: { unlockAnswers: (_socket: Socket) => void }) => void,
    ) => callback(game),
  )

  return {
    game,
    withGame,
    registry: {
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

vi.mock("@razzia/socket/services/registry", () => ({
  default: {
    getInstance: () => mocks.registry,
  },
}))

vi.mock("@razzia/socket/services/config", () => ({
  getGameConfig: vi.fn(),
  getQuizz: vi.fn(() => []),
}))

vi.mock("@razzia/socket/services/visuals", () => ({
  resolveVisuals: vi.fn(),
}))

describe("gameSocketHandlers manager answer unlock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("registers the typed event and forwards it to the game boundary", async () => {
    const handlers = new Map<string, (...args: never[]) => void>()
    const socket = {
      id: "manager",
      handshake: { auth: { clientId: "manager-client" } },
      on: vi.fn((event: string, handler: (...args: never[]) => void) => {
        handlers.set(event, handler)
      }),
    } as unknown as Socket
    const io = {} as Server
    const { gameSocketHandlers } = await import("@razzia/socket/handlers/game")

    gameSocketHandlers({ io, socket } as SocketContext)
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
})
