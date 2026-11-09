import type { Socket } from "@razzia/common/types/game/socket"
import { guardHandlers } from "@razzia/socket/handlers/guard"
import { afterEach, describe, expect, it, vi } from "vitest"

type Listener = (...args: unknown[]) => unknown

const createSocket = () => {
  const listeners = new Map<string, Listener>()
  const socket = {
    on: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, listener)

      return socket
    }),
  }

  return { socket: socket as unknown as Socket, listeners }
}

const watchErrors = () =>
  vi.spyOn(console, "error").mockImplementation(() => undefined)

describe("guardHandlers", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("logs a handler that throws instead of letting it end the process", () => {
    const logged = watchErrors()
    const { socket, listeners } = createSocket()
    const boom = new Error("boom")

    guardHandlers(socket)
    socket.on("player:reconnect", () => {
      throw boom
    })

    expect(() => listeners.get("player:reconnect")?.()).not.toThrow()
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("player:reconnect"),
      boom,
    )
  })

  it("logs a handler whose promise rejects", async () => {
    const logged = watchErrors()
    const { socket, listeners } = createSocket()
    const boom = new Error("later")

    guardHandlers(socket)
    socket.on("manager:startGame", () => Promise.reject(boom))

    listeners.get("manager:startGame")?.()
    await Promise.resolve()

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("manager:startGame"),
      boom,
    )
  })

  it("still hands a handler its payload and ack", () => {
    const logged = watchErrors()
    const { socket, listeners } = createSocket()
    const handler = vi.fn()
    const ack = vi.fn()

    guardHandlers(socket)
    socket.on("manager:finishGame", handler)
    listeners.get("manager:finishGame")?.({ gameId: "g" }, ack)

    expect(handler).toHaveBeenCalledWith({ gameId: "g" }, ack)
    expect(logged).not.toHaveBeenCalled()
  })
})
