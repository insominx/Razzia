import { EVENTS } from "@razzia/common/constants"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { PollOutcome } from "@razzia/common/types/poll"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const game = {
    startPoll: vi.fn((): PollOutcome => "accepted"),
    startInlinePoll: vi.fn((): PollOutcome => "accepted"),
  }

  return {
    game,
    withGame: vi.fn(
      (
        _gameId: string | undefined,
        _socket: Socket,
        callback: (_game: typeof game) => void,
      ) => callback(game),
    ),
  }
})

vi.mock("@razzia/socket/utils/game", () => ({ withGame: mocks.withGame }))
vi.mock("@razzia/socket/services/game", () => ({ default: vi.fn() }))
vi.mock("@razzia/socket/services/registry", () => ({
  default: { getInstance: () => ({ getGameById: vi.fn() }) },
}))
vi.mock("@razzia/socket/services/config", () => ({
  getGameConfig: vi.fn(),
  getQuizz: vi.fn(() => []),
}))
vi.mock("@razzia/socket/services/visuals", () => ({ resolveVisuals: vi.fn() }))

const register = async () => {
  const handlers = new Map<string, (...args: never[]) => void>()
  const socket = {
    id: "manager",
    handshake: { auth: { clientId: "client" } },
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      handlers.set(event, handler)
    }),
  } as unknown as Socket
  const { gameSocketHandlers } = await import("@razzia/socket/handlers/game")

  gameSocketHandlers({ io: {} as Server, socket } as SocketContext)

  return {
    socket,
    send: (message: unknown, ack?: unknown) =>
      handlers.get(EVENTS.MANAGER.START_POLL)?.(message as never, ack as never),
  }
}

describe("manager:startPoll with a definition", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("hands the definition to the game and answers with its outcome", async () => {
    const { send, socket } = await register()
    const ack = vi.fn()
    const poll = { id: "p", question: "q", options: ["a", "b"] }

    send({ gameId: "g", poll }, ack)

    expect(mocks.game.startInlinePoll).toHaveBeenCalledWith(socket, poll)
    expect(mocks.game.startPoll).not.toHaveBeenCalled()
    expect(ack).toHaveBeenCalledWith("accepted")
  })

  it("hands whatever was sent to the game untouched, and answers what the game answers", async () => {
    const { send } = await register()

    for (const poll of ["x", 7, null, [], { id: 1 }]) {
      mocks.game.startInlinePoll.mockReturnValueOnce("invalid")
      const ack = vi.fn()

      send({ gameId: "g", poll }, ack)

      expect(ack).toHaveBeenCalledWith("invalid")
    }
  })

  it("lets a definition win over a stored id", async () => {
    const { send } = await register()

    send({ gameId: "g", pollId: "stored", poll: { id: "p" } }, vi.fn())

    expect(mocks.game.startInlinePoll).toHaveBeenCalledTimes(1)
    expect(mocks.game.startPoll).not.toHaveBeenCalled()
  })

  it("still starts a stored poll by id, as before", async () => {
    const { send, socket } = await register()
    const ack = vi.fn()

    send({ gameId: "g", pollId: "stored" }, ack)

    expect(mocks.game.startPoll).toHaveBeenCalledWith(socket, "stored")
    expect(mocks.game.startInlinePoll).not.toHaveBeenCalled()
  })

  it("runs the command even when the ack was left out", async () => {
    const { send } = await register()

    expect(() => {
      send({ gameId: "g", poll: { id: "p" } })
    }).not.toThrow()
    expect(mocks.game.startInlinePoll).toHaveBeenCalledTimes(1)
  })
})
