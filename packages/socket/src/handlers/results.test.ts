import { EVENTS } from "@razzia/common/constants"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteResult: vi.fn(),
  getResultById: vi.fn(),
  getGameConfig: vi.fn(),
}))

vi.mock("@razzia/socket/services/config", () => ({
  deleteResult: mocks.deleteResult,
  getResultById: mocks.getResultById,
  getGameConfig: mocks.getGameConfig,
  getQuizzMeta: () => [],
  getResultsMeta: () => [],
}))

vi.mock("@razzia/socket/services/visuals", () => ({
  resolveVisuals: () => ({}),
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
  const { resultsSocketHandlers } =
    await import("@razzia/socket/handlers/results")
  const manager = (await import("@razzia/socket/services/manager")).default

  resultsSocketHandlers({ io: {} as Server, socket } as SocketContext)
  manager.login(socket)

  return { handlers, emit, socket, manager }
}

const deleteResult = (
  handlers: Map<string, Handler>,
  ...args: unknown[]
): void => {
  handlers.get(EVENTS.RESULTS.DELETE)?.(...(args as never[]))
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  mocks.deleteResult.mockReset()
  mocks.getGameConfig.mockReset()
  mocks.getGameConfig.mockReturnValue({ managerPassword: "secret" })
})

describe("RESULTS.DELETE", () => {
  it("acks ok and refreshes the config after the file is gone", async () => {
    const { handlers, emit } = await connect()
    const ack = vi.fn()

    deleteResult(handlers, "result-1", ack)

    expect(mocks.deleteResult).toHaveBeenCalledWith("result-1")
    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.CONFIG, expect.anything())
  })

  it("counts a result that is already gone as deleted", async () => {
    const { ItemNotFoundError } = await import("@razzia/socket/utils/safe")
    mocks.deleteResult.mockImplementation(() => {
      throw new ItemNotFoundError('Result "result-1" not found')
    })
    const { handlers } = await connect()
    const ack = vi.fn()

    deleteResult(handlers, "result-1", ack)

    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
  })

  it("acks an error key, never raw error text, when the delete fails", async () => {
    mocks.deleteResult.mockImplementation(() => {
      throw new Error("EPERM: operation not permitted, unlink 'C:\\x.json'")
    })
    const { handlers, emit } = await connect()
    const ack = vi.fn()

    deleteResult(handlers, "result-1", ack)

    expect(ack).toHaveBeenCalledExactlyOnceWith({
      error: "errors:result.failedToDelete",
    })
    expect(emit).not.toHaveBeenCalledWith(
      EVENTS.MANAGER.CONFIG,
      expect.anything(),
    )
  })

  it("acks an error for an id that is not text", async () => {
    const { handlers } = await connect()
    const ack = vi.fn()

    deleteResult(handlers, { id: 1 }, ack)

    expect(mocks.deleteResult).not.toHaveBeenCalled()
    expect(ack).toHaveBeenCalledExactlyOnceWith({
      error: "errors:result.failedToDelete",
    })
  })

  it("does not throw when the ack is missing or not a function", async () => {
    const { handlers } = await connect()

    expect(() => {
      deleteResult(handlers, "result-1")
      deleteResult(handlers, "result-1", "not a function")
      deleteResult(handlers, 42, 42)
      deleteResult(handlers)
    }).not.toThrow()
  })

  it("still acks ok when the config refresh fails after the delete", async () => {
    mocks.getGameConfig.mockImplementation(() => {
      throw new Error("Unexpected token in game.json")
    })
    const { handlers } = await connect()
    const ack = vi.fn()

    expect(() => {
      deleteResult(handlers, "result-1", ack)
    }).not.toThrow()

    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: true })
  })

  it("turns away a client that is not logged in", async () => {
    const { handlers, emit, manager, socket } = await connect()
    manager.logout(socket)
    const ack = vi.fn()

    deleteResult(handlers, "result-1", ack)

    expect(mocks.deleteResult).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.UNAUTHORIZED)
    expect(ack).toHaveBeenCalledWith({ error: "errors:manager.unauthorized" })
  })
})
