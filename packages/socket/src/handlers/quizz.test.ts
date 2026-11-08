import { EVENTS } from "@razzia/common/constants"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteQuizz: vi.fn(),
  restoreCommittedQuizz: vi.fn(),
  getGameConfig: vi.fn(),
  finalizeBackgroundMutation: vi.fn(),
}))

vi.mock("@razzia/socket/services/config", () => ({
  deleteQuizz: mocks.deleteQuizz,
  restoreCommittedQuizz: mocks.restoreCommittedQuizz,
  getGameConfig: mocks.getGameConfig,
  getQuizzById: vi.fn(),
  saveQuizz: vi.fn(),
  updateQuizz: vi.fn(),
  getQuizzMeta: () => [],
  getResultsMeta: () => [],
}))

vi.mock("@razzia/socket/services/visuals", () => ({
  resolveVisuals: () => ({}),
  finalizeBackgroundMutation: mocks.finalizeBackgroundMutation,
}))

type Handler = (...args: never[]) => void

const connect = async () => {
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
  const { quizzSocketHandlers } = await import("@razzia/socket/handlers/quizz")
  const manager = (await import("@razzia/socket/services/manager")).default

  quizzSocketHandlers({ io: {} as Server, socket } as SocketContext)
  manager.login(socket)

  return { handlers, emit }
}

const deleteQuizz = (
  handlers: Map<string, Handler>,
  ...args: unknown[]
): void => {
  handlers.get(EVENTS.QUIZZ.DELETE)?.(...(args as never[]))
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  mocks.deleteQuizz.mockReset()
  mocks.getGameConfig.mockReset()
  mocks.deleteQuizz.mockReturnValue({
    id: "quiz-1",
    previousBackground: { kind: "config-asset", path: "room.png" },
  })
  mocks.getGameConfig.mockReturnValue({ managerPassword: "secret" })
})

describe("QUIZZ.DELETE", () => {
  it("acks ok, frees the background and refreshes the config", async () => {
    const { handlers, emit } = await connect()
    const ack = vi.fn()

    deleteQuizz(handlers, "quiz-1", ack)

    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
    expect(mocks.finalizeBackgroundMutation).toHaveBeenCalledWith({
      kind: "config-asset",
      path: "room.png",
    })
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.CONFIG, expect.anything())
  })

  it("counts a quiz that is already gone as deleted", async () => {
    const { ItemNotFoundError } = await import("@razzia/socket/utils/safe")
    mocks.deleteQuizz.mockImplementation(() => {
      throw new ItemNotFoundError('Quizz "quiz-1" not found')
    })
    const { handlers, emit } = await connect()
    const ack = vi.fn()

    deleteQuizz(handlers, "quiz-1", ack)

    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
    expect(emit).not.toHaveBeenCalledWith(EVENTS.QUIZZ.ERROR, expect.anything())
  })

  it("acks the error key and does not also emit QUIZZ.ERROR when it fails", async () => {
    mocks.deleteQuizz.mockImplementation(() => {
      throw new Error("EPERM: operation not permitted, unlink 'C:\\q.json'")
    })
    const { handlers, emit } = await connect()
    const ack = vi.fn()

    deleteQuizz(handlers, "quiz-1", ack)

    expect(ack).toHaveBeenCalledExactlyOnceWith({
      error: "errors:quizz.failedToDelete",
    })
    expect(emit).not.toHaveBeenCalledWith(EVENTS.QUIZZ.ERROR, expect.anything())
  })

  it("acks an error for an id that is not text", async () => {
    const { handlers } = await connect()
    const ack = vi.fn()

    deleteQuizz(handlers, null, ack)

    expect(mocks.deleteQuizz).not.toHaveBeenCalled()
    expect(ack).toHaveBeenCalledExactlyOnceWith({
      error: "errors:quizz.failedToDelete",
    })
  })

  it("does not throw when the ack is missing or not a function", async () => {
    const { handlers } = await connect()

    expect(() => {
      deleteQuizz(handlers, "quiz-1")
      deleteQuizz(handlers, "quiz-1", {})
      deleteQuizz(handlers, undefined, 7)
      deleteQuizz(handlers)
    }).not.toThrow()
  })

  it("still acks ok when the config refresh fails after the delete", async () => {
    mocks.getGameConfig.mockImplementation(() => {
      throw new Error("Unexpected token in game.json")
    })
    const { handlers } = await connect()
    const ack = vi.fn()

    expect(() => {
      deleteQuizz(handlers, "quiz-1", ack)
    }).not.toThrow()

    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
  })
})

describe("QUIZZ.RESTORE", () => {
  const restore = (handlers: Map<string, Handler>, ...args: unknown[]) => {
    handlers.get(EVENTS.QUIZZ.RESTORE)?.(...(args as never[]))
  }

  it("acks ok, hands the replaced background back and refreshes the config", async () => {
    mocks.restoreCommittedQuizz.mockReturnValue({
      id: "quiz-1",
      previousBackground: { kind: "config-asset", path: "old.png" },
    })
    const { handlers, emit } = await connect()
    const ack = vi.fn()

    restore(handlers, "quiz-1", ack)

    expect(mocks.restoreCommittedQuizz).toHaveBeenCalledWith("quiz-1")
    expect(mocks.finalizeBackgroundMutation).toHaveBeenCalledWith(
      { kind: "config-asset", path: "old.png" },
      undefined,
    )
    expect(ack).toHaveBeenCalledWith({ ok: true })
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.CONFIG, expect.anything())
  })

  it("passes the 'no committed version' key through and any other failure as a generic one", async () => {
    const { handlers } = await connect()
    const ack = vi.fn()

    mocks.restoreCommittedQuizz.mockImplementationOnce(() => {
      throw new Error("errors:quizz.noCommittedVersion")
    })
    restore(handlers, "quiz-1", ack)
    mocks.restoreCommittedQuizz.mockImplementationOnce(() => {
      throw new Error("ENOENT: /secret/path")
    })
    restore(handlers, "quiz-1", ack)

    expect(ack.mock.calls).toEqual([
      [{ error: "errors:quizz.noCommittedVersion" }],
      [{ error: "errors:quizz.failedToRestore" }],
    ])
  })

  it("acks an error for a bad id and never throws without an ack", async () => {
    const { handlers } = await connect()
    const ack = vi.fn()

    restore(handlers, 42, ack)

    expect(ack).toHaveBeenCalledWith({ error: "errors:quizz.failedToRestore" })
    expect(() => restore(handlers, "quiz-1")).not.toThrow()
    expect(() => restore(handlers, "quiz-1", "nope")).not.toThrow()
  })
})
