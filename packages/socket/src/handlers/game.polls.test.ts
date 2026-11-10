import { EVENTS } from "@razzia/common/constants"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { PollOutcome, PollVoteOutcome } from "@razzia/common/types/poll"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const game = {
    startPoll: vi.fn((): PollOutcome => "accepted"),
    closePoll: vi.fn((): PollOutcome => "accepted"),
    dismissPoll: vi.fn((): PollOutcome => "none"),
    votePoll: vi.fn((): PollVoteOutcome => "accepted"),
    syncPoll: vi.fn(),
  }

  return {
    game,
    registry: {
      getGameById: vi.fn((id: string) => (id === "g" ? game : undefined)),
    },
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
  default: { getInstance: () => mocks.registry },
}))
vi.mock("@razzia/socket/services/config", () => ({
  getGameConfig: vi.fn(),
  getQuizz: vi.fn(() => []),
}))
vi.mock("@razzia/socket/services/visuals", () => ({ resolveVisuals: vi.fn() }))

const register = async () => {
  const handlers = new Map<string, (...args: never[]) => void>()
  const emit = vi.fn()
  const socket = {
    id: "manager",
    handshake: { auth: { clientId: "client" } },
    emit,
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      handlers.set(event, handler)
    }),
  } as unknown as Socket
  const { gameSocketHandlers } = await import("@razzia/socket/handlers/game")

  gameSocketHandlers({ io: {} as Server, socket } as SocketContext)

  return { handlers, socket, emit }
}

type Handlers = Map<string, (...args: never[]) => void>

// Sends one event to the registered handlers, the way a client would.
const sender =
  (handlers: Handlers) => (event: string, message: unknown, ack?: unknown) =>
    handlers.get(event)?.(message as never, ack as never)

describe("poll socket handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("starts a poll for the host and answers with the outcome", async () => {
    const { handlers, socket } = await register()
    const send = sender(handlers)
    const ack = vi.fn()

    send(EVENTS.MANAGER.START_POLL, { gameId: "g", pollId: "p" }, ack)

    expect(mocks.game.startPoll).toHaveBeenCalledWith(socket, "p")
    expect(ack).toHaveBeenCalledWith("accepted")
  })

  it("answers notFound to a start with no usable poll id, without starting", async () => {
    const { handlers } = await register()
    const send = sender(handlers)

    for (const message of [{ gameId: "g" }, { gameId: "g", pollId: 7 }, null]) {
      const ack = vi.fn()

      send(EVENTS.MANAGER.START_POLL, message, ack)

      if (message) {
        expect(ack).toHaveBeenCalledWith("notFound")
      }
    }

    expect(mocks.game.startPoll).not.toHaveBeenCalled()
  })

  it("closes and dismisses through the ack", async () => {
    const { handlers, socket } = await register()
    const send = sender(handlers)
    const closeAck = vi.fn()
    const dismissAck = vi.fn()

    send(EVENTS.MANAGER.CLOSE_POLL, { gameId: "g" }, closeAck)
    send(EVENTS.MANAGER.DISMISS_POLL, { gameId: "g" }, dismissAck)

    expect(mocks.game.closePoll).toHaveBeenCalledWith(socket, undefined)
    expect(closeAck).toHaveBeenCalledWith("accepted")
    expect(mocks.game.dismissPoll).toHaveBeenCalledWith(socket, undefined)
    expect(dismissAck).toHaveBeenCalledWith("none")
  })

  it("passes the poll a close or dismiss names", async () => {
    const { handlers, socket } = await register()
    const send = sender(handlers)

    send(
      EVENTS.MANAGER.CLOSE_POLL,
      { gameId: "g", pollId: "role-clarity" },
      vi.fn(),
    )
    send(
      EVENTS.MANAGER.DISMISS_POLL,
      { gameId: "g", pollId: "role-clarity" },
      vi.fn(),
    )

    expect(mocks.game.closePoll).toHaveBeenCalledWith(socket, "role-clarity")
    expect(mocks.game.dismissPoll).toHaveBeenCalledWith(socket, "role-clarity")
  })

  it("refuses a malformed poll name rather than act on whatever is showing", async () => {
    const { handlers } = await register()
    const send = sender(handlers)

    for (const pollId of [42, "", "Not A Slug", null, "x".repeat(65)]) {
      const closeAck = vi.fn()
      const dismissAck = vi.fn()

      send(EVENTS.MANAGER.CLOSE_POLL, { gameId: "g", pollId }, closeAck)
      send(EVENTS.MANAGER.DISMISS_POLL, { gameId: "g", pollId }, dismissAck)

      expect(closeAck).toHaveBeenCalledWith("notCurrent")
      expect(dismissAck).toHaveBeenCalledWith("notCurrent")
    }

    expect(mocks.game.closePoll).not.toHaveBeenCalled()
    expect(mocks.game.dismissPoll).not.toHaveBeenCalled()
  })

  it("takes a vote and answers with the outcome", async () => {
    const { handlers, socket } = await register()
    const send = sender(handlers)
    const ack = vi.fn()

    send(EVENTS.POLL.VOTE, { gameId: "g", pollId: "p", option: 2 }, ack)

    expect(mocks.game.votePoll).toHaveBeenCalledWith(socket, "p", 2)
    expect(ack).toHaveBeenCalledWith("accepted")
  })

  it("turns away a vote that is not a poll id and a number, without voting", async () => {
    const { handlers } = await register()
    const send = sender(handlers)
    const bad = [
      { gameId: "g", pollId: "p" },
      { gameId: "g", pollId: "p", option: "1" },
      { gameId: "g", option: 1 },
      { gameId: "g", pollId: 1, option: 1 },
    ]

    for (const message of bad) {
      const ack = vi.fn()

      send(EVENTS.POLL.VOTE, message, ack)

      expect(ack).toHaveBeenCalledWith("invalid")
    }

    expect(mocks.game.votePoll).not.toHaveBeenCalled()
  })

  it("lets a screen that has just opened ask where the poll stands", async () => {
    const { handlers, socket } = await register()
    const send = sender(handlers)

    send(EVENTS.POLL.SYNC, { gameId: "g" })

    expect(mocks.game.syncPoll).toHaveBeenCalledWith(socket)
  })

  it("says nothing to a screen asking about a room that is gone, or asking badly", async () => {
    const { handlers, emit } = await register()
    const send = sender(handlers)

    expect(() => {
      send(EVENTS.POLL.SYNC, { gameId: "gone" })
      send(EVENTS.POLL.SYNC, { gameId: 7 })
      send(EVENTS.POLL.SYNC, null)
      send(EVENTS.POLL.SYNC, undefined)
    }).not.toThrow()
    expect(mocks.game.syncPoll).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it("still runs a command sent without a usable ack", async () => {
    const { handlers } = await register()
    const send = sender(handlers)

    expect(() => {
      send(EVENTS.MANAGER.CLOSE_POLL, { gameId: "g" }, "nope")
      send(EVENTS.MANAGER.START_POLL, { gameId: "g", pollId: "p" })
      send(EVENTS.POLL.VOTE, { gameId: "g", pollId: "p", option: 0 })
    }).not.toThrow()
    expect(mocks.game.closePoll).toHaveBeenCalledTimes(1)
    expect(mocks.game.startPoll).toHaveBeenCalledTimes(1)
    expect(mocks.game.votePoll).toHaveBeenCalledTimes(1)
  })
})
