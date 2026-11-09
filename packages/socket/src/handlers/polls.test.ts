import { EVENTS } from "@razzia/common/constants"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getPollById: vi.fn(),
  savePoll: vi.fn(),
  updatePoll: vi.fn(),
  deletePoll: vi.fn(),
  getPollResultById: vi.fn(),
  deletePollResult: vi.fn(),
  getGameConfig: vi.fn(),
}))

vi.mock("@razzia/socket/services/poll-store", () => ({
  getPollById: mocks.getPollById,
  savePoll: mocks.savePoll,
  updatePoll: mocks.updatePoll,
  deletePoll: mocks.deletePoll,
  getPollResultById: mocks.getPollResultById,
  deletePollResult: mocks.deletePollResult,
  getPollMeta: () => [],
  getPollResultsMeta: () => [],
}))

vi.mock("@razzia/socket/services/config", () => ({
  getGameConfig: mocks.getGameConfig,
  getQuizzMeta: () => [],
  getResultsMeta: () => [],
}))

vi.mock("@razzia/socket/services/visuals", () => ({
  resolveVisuals: () => ({}),
}))

type Handler = (...args: never[]) => void

const connect = async (loggedIn = true) => {
  const handlers = new Map<string, Handler>()
  const emit = vi.fn()
  const socket = {
    id: "socket-host",
    handshake: { auth: { clientId: "host-client" } },
    emit,
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler)
    }),
  } as unknown as Socket
  const { pollsSocketHandlers } = await import("@razzia/socket/handlers/polls")
  const manager = (await import("@razzia/socket/services/manager")).default

  pollsSocketHandlers({ io: {} as Server, socket } as SocketContext)

  if (loggedIn) {
    manager.login(socket)
  }

  return { handlers, emit }
}

const send = (
  handlers: Map<string, Handler>,
  event: string,
  ...args: unknown[]
): void => {
  handlers.get(event)?.(...(args as never[]))
}

const errorsSent = (emit: ReturnType<typeof vi.fn>) =>
  emit.mock.calls.filter(([event]) => event === EVENTS.POLLS.ERROR)

beforeEach(() => {
  vi.resetModules()
  // Resets what a test made them do, not only their calls.
  Object.values(mocks).forEach((mock) => {
    mock.mockReset()
  })
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  mocks.getGameConfig.mockReturnValue({ managerPassword: "secret" })
})

describe("POLLS.GET", () => {
  it("sends the poll asked for", async () => {
    mocks.getPollById.mockReturnValue({ id: "p1", question: "Q?" })
    const { handlers, emit } = await connect()

    send(handlers, EVENTS.POLLS.GET, "p1")

    expect(mocks.getPollById).toHaveBeenCalledWith("p1")
    expect(emit).toHaveBeenCalledWith(EVENTS.POLLS.DATA, {
      poll: { id: "p1", question: "Q?" },
    })
  })

  it("says not found for a poll that cannot be read, without the reason", async () => {
    mocks.getPollById.mockImplementation(() => {
      throw new Error("ENOENT: C:\\secret\\p1.json")
    })
    const { handlers, emit } = await connect()

    send(handlers, EVENTS.POLLS.GET, "p1")

    expect(errorsSent(emit)).toEqual([
      [EVENTS.POLLS.ERROR, "errors:poll.notFound"],
    ])
  })

  it("ignores an id that is not text", async () => {
    const { handlers, emit } = await connect()

    send(handlers, EVENTS.POLLS.GET, 7)
    send(handlers, EVENTS.POLLS.GET, null)

    expect(mocks.getPollById).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })
})

describe("POLLS.SAVE", () => {
  it("hands the poll's name to the save, apart from the poll, and tells the host", async () => {
    mocks.savePoll.mockReturnValue("poll-new0001")
    const { handlers, emit } = await connect()

    send(handlers, EVENTS.POLLS.SAVE, {
      id: "poll-new0001",
      question: "Q?",
      options: ["a", "b"],
    })

    expect(mocks.savePoll).toHaveBeenCalledWith(
      { question: "Q?", options: ["a", "b"] },
      "poll-new0001",
    )
    expect(emit).toHaveBeenCalledWith(EVENTS.POLLS.SAVE_SUCCESS, {
      id: "poll-new0001",
    })
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.CONFIG, expect.anything())
  })

  it("passes a validation key through, and hides any other failure", async () => {
    const { handlers, emit } = await connect()

    mocks.savePoll.mockImplementationOnce(() => {
      throw new Error("errors:poll.tooFewOptions")
    })
    send(handlers, EVENTS.POLLS.SAVE, { id: "poll-new0001" })
    mocks.savePoll.mockImplementationOnce(() => {
      throw new Error("EACCES: C:\\secret")
    })
    send(handlers, EVENTS.POLLS.SAVE, { id: "poll-new0001" })

    expect(errorsSent(emit)).toEqual([
      [EVENTS.POLLS.ERROR, "errors:poll.tooFewOptions"],
      [EVENTS.POLLS.ERROR, "errors:poll.failedToSave"],
    ])
  })

  it("copes with a payload that is not an object", async () => {
    mocks.savePoll.mockImplementation(() => {
      throw new Error("errors:poll.questionEmpty")
    })
    const { handlers } = await connect()

    expect(() => {
      send(handlers, EVENTS.POLLS.SAVE, null)
      send(handlers, EVENTS.POLLS.SAVE, "text")
      send(handlers, EVENTS.POLLS.SAVE)
    }).not.toThrow()
  })
})

describe("POLLS.UPDATE", () => {
  it("replaces the poll named by id and tells the host", async () => {
    mocks.updatePoll.mockReturnValue("p1")
    const { handlers, emit } = await connect()

    send(handlers, EVENTS.POLLS.UPDATE, {
      id: "p1",
      question: "Q?",
      options: ["a", "b"],
    })

    expect(mocks.updatePoll).toHaveBeenCalledWith("p1", {
      question: "Q?",
      options: ["a", "b"],
    })
    expect(emit).toHaveBeenCalledWith(EVENTS.POLLS.UPDATE_SUCCESS, {
      id: "p1",
    })
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.CONFIG, expect.anything())
  })

  it("ignores an update without a text id", async () => {
    const { handlers } = await connect()

    send(handlers, EVENTS.POLLS.UPDATE, { question: "Q?" })
    send(handlers, EVENTS.POLLS.UPDATE, { id: 3 })

    expect(mocks.updatePoll).not.toHaveBeenCalled()
  })

  it("says not found for a poll that is gone, and hides other failures", async () => {
    const { handlers, emit } = await connect()

    mocks.updatePoll.mockImplementationOnce(() => {
      throw new Error("errors:poll.notFound")
    })
    send(handlers, EVENTS.POLLS.UPDATE, { id: "p1" })
    mocks.updatePoll.mockImplementationOnce(() => {
      throw new Error("EPERM: C:\\secret")
    })
    send(handlers, EVENTS.POLLS.UPDATE, { id: "p1" })

    expect(errorsSent(emit)).toEqual([
      [EVENTS.POLLS.ERROR, "errors:poll.notFound"],
      [EVENTS.POLLS.ERROR, "errors:poll.failedToUpdate"],
    ])
  })
})

describe("POLLS.DELETE", () => {
  it("acks ok and refreshes the config", async () => {
    const { handlers, emit } = await connect()
    const ack = vi.fn()

    send(handlers, EVENTS.POLLS.DELETE, "p1", ack)

    expect(mocks.deletePoll).toHaveBeenCalledWith("p1")
    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.CONFIG, expect.anything())
  })

  it("counts a poll that is already gone as deleted", async () => {
    const { ItemNotFoundError } = await import("@razzia/socket/utils/safe")
    mocks.deletePoll.mockImplementation(() => {
      throw new ItemNotFoundError('Poll "p1" not found')
    })
    const { handlers } = await connect()
    const ack = vi.fn()

    send(handlers, EVENTS.POLLS.DELETE, "p1", ack)

    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
  })

  it("acks the error key when it fails, and for an id that is not text", async () => {
    mocks.deletePoll.mockImplementation(() => {
      throw new Error("EPERM: C:\\secret")
    })
    const { handlers } = await connect()
    const ack = vi.fn()

    send(handlers, EVENTS.POLLS.DELETE, "p1", ack)
    send(handlers, EVENTS.POLLS.DELETE, null, ack)

    expect(ack.mock.calls).toEqual([
      [{ error: "errors:poll.failedToDelete" }],
      [{ error: "errors:poll.failedToDelete" }],
    ])
  })

  it("does not throw when the ack is missing or not a function", async () => {
    const { handlers } = await connect()

    expect(() => {
      send(handlers, EVENTS.POLLS.DELETE, "p1")
      send(handlers, EVENTS.POLLS.DELETE, "p1", {})
      send(handlers, EVENTS.POLLS.DELETE)
    }).not.toThrow()
  })

  it("still acks ok when the config refresh fails after the delete", async () => {
    mocks.getGameConfig.mockImplementation(() => {
      throw new Error("Unexpected token in game.json")
    })
    const { handlers } = await connect()
    const ack = vi.fn()

    send(handlers, EVENTS.POLLS.DELETE, "p1", ack)

    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
  })
})

describe("POLLS.RESULT_GET", () => {
  it("sends the result asked for", async () => {
    mocks.getPollResultById.mockReturnValue({ id: "r1", question: "Q?" })
    const { handlers, emit } = await connect()

    send(handlers, EVENTS.POLLS.RESULT_GET, "r1")

    expect(mocks.getPollResultById).toHaveBeenCalledWith("r1")
    expect(emit).toHaveBeenCalledWith(EVENTS.POLLS.RESULT_DATA, {
      id: "r1",
      question: "Q?",
    })
  })

  it("says the result is not found, without the reason, when it cannot be read", async () => {
    mocks.getPollResultById.mockImplementation(() => {
      throw new Error("ENOENT: C:\\secret\\r1.json")
    })
    const { handlers, emit } = await connect()

    send(handlers, EVENTS.POLLS.RESULT_GET, "r1")

    expect(errorsSent(emit)).toEqual([
      [EVENTS.POLLS.ERROR, "errors:poll.resultNotFound"],
    ])
  })

  it("ignores an id that is not text", async () => {
    const { handlers, emit } = await connect()

    send(handlers, EVENTS.POLLS.RESULT_GET, 7)
    send(handlers, EVENTS.POLLS.RESULT_GET)

    expect(mocks.getPollResultById).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })
})

describe("POLLS.RESULT_DELETE", () => {
  it("acks ok and refreshes the config", async () => {
    const { handlers, emit } = await connect()
    const ack = vi.fn()

    send(handlers, EVENTS.POLLS.RESULT_DELETE, "r1", ack)

    expect(mocks.deletePollResult).toHaveBeenCalledWith("r1")
    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.CONFIG, expect.anything())
  })

  it("counts a result that is already gone as deleted", async () => {
    const { ItemNotFoundError } = await import("@razzia/socket/utils/safe")
    mocks.deletePollResult.mockImplementation(() => {
      throw new ItemNotFoundError("gone")
    })
    const { handlers } = await connect()
    const ack = vi.fn()

    send(handlers, EVENTS.POLLS.RESULT_DELETE, "r1", ack)

    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
  })

  it("acks the error key when it fails, and for an id that is not text", async () => {
    mocks.deletePollResult.mockImplementation(() => {
      throw new Error("EPERM: C:\\secret")
    })
    const { handlers } = await connect()
    const ack = vi.fn()

    send(handlers, EVENTS.POLLS.RESULT_DELETE, "r1", ack)
    send(handlers, EVENTS.POLLS.RESULT_DELETE, null, ack)

    expect(ack.mock.calls).toEqual([
      [{ error: "errors:poll.failedToDeleteResult" }],
      [{ error: "errors:poll.failedToDeleteResult" }],
    ])
  })

  it("does not throw when the ack is missing or not a function", async () => {
    const { handlers } = await connect()

    expect(() => {
      send(handlers, EVENTS.POLLS.RESULT_DELETE, "r1")
      send(handlers, EVENTS.POLLS.RESULT_DELETE, "r1", {})
      send(handlers, EVENTS.POLLS.RESULT_DELETE)
    }).not.toThrow()
  })
})

describe("every poll command", () => {
  it.each([
    EVENTS.POLLS.GET,
    EVENTS.POLLS.SAVE,
    EVENTS.POLLS.UPDATE,
    EVENTS.POLLS.DELETE,
    EVENTS.POLLS.RESULT_GET,
    EVENTS.POLLS.RESULT_DELETE,
  ])("needs the host to be logged in (%s)", async (event) => {
    const { handlers, emit } = await connect(false)
    const ack = vi.fn()

    send(handlers, event, { id: "p1" }, ack)

    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.UNAUTHORIZED)
    expect(mocks.getPollById).not.toHaveBeenCalled()
    expect(mocks.savePoll).not.toHaveBeenCalled()
    expect(mocks.updatePoll).not.toHaveBeenCalled()
    expect(mocks.deletePoll).not.toHaveBeenCalled()
    expect(mocks.getPollResultById).not.toHaveBeenCalled()
    expect(mocks.deletePollResult).not.toHaveBeenCalled()
  })
})
