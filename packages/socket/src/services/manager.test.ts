import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EVENTS } from "@razzia/common/constants"
import type { Socket } from "@razzia/common/types/game/socket"

const makeSocket = (clientId = "client-1") => {
  const emit = vi.fn()
  const socket = {
    emit,
    handshake: { auth: { clientId } },
  } as unknown as Socket

  return { socket, emit }
}

describe("Manager.withAuth", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("emits UNAUTHORIZED and invokes ack callback with error when logged out", async () => {
    const manager = (await import("@razzia/socket/services/manager")).default
    const { socket, emit } = makeSocket()
    const handler = vi.fn()
    const callback = vi.fn()

    const wrapped = manager.withAuth(socket, handler)
    wrapped({ dialect: "stage-studio" }, callback)

    expect(handler).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.UNAUTHORIZED)
    expect(callback).toHaveBeenCalledWith({
      error: "errors:manager.unauthorized",
    })
  })

  it("runs handler when logged in", async () => {
    const manager = (await import("@razzia/socket/services/manager")).default
    const { socket } = makeSocket("logged-in")
    manager.login(socket)
    const handler = vi.fn()

    manager.withAuth(socket, handler)("payload")

    expect(handler).toHaveBeenCalledWith("payload")
  })

  it("exposes isLoggedByClientId for HTTP upload auth", async () => {
    const manager = (await import("@razzia/socket/services/manager")).default
    const { socket } = makeSocket("http-client")
    expect(manager.isLoggedByClientId("http-client")).toBe(false)
    manager.login(socket)
    expect(manager.isLoggedByClientId("http-client")).toBe(true)
  })
})

describe("verifyManagerAuth", () => {
  it("rejects missing or placeholder passwords", async () => {
    const { verifyManagerAuth } =
      await import("@razzia/socket/services/manager-auth")

    expect(verifyManagerAuth("any", { managerPassword: undefined })).toEqual({
      ok: false,
      error: "errors:manager.failedToReadConfig",
    })
    expect(
      verifyManagerAuth("PASSWORD", { managerPassword: "PASSWORD" }),
    ).toEqual({
      ok: false,
      error: "errors:manager.passwordNotConfigured",
    })
    expect(verifyManagerAuth(undefined, { managerPassword: "secret" })).toEqual(
      {
        ok: false,
        error: "errors:manager.invalidPassword",
      },
    )
    expect(verifyManagerAuth("wrong", { managerPassword: "secret" })).toEqual({
      ok: false,
      error: "errors:manager.invalidPassword",
    })
    expect(verifyManagerAuth("secret", { managerPassword: "secret" })).toEqual({
      ok: true,
    })
  })
})

describe("Manager login lifetime", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const HOUR = 60 * 60_000

  it("forgets a login after 12 hours without an authorized call", async () => {
    const manager = (await import("@razzia/socket/services/manager")).default
    const { socket, emit } = makeSocket("idle")
    manager.login(socket)

    vi.advanceTimersByTime(12 * HOUR - 1)
    expect(manager.isLoggedByClientId("idle")).toBe(true)

    // The check above refreshed it, so it takes a whole new window.
    vi.advanceTimersByTime(12 * HOUR)
    expect(manager.isLoggedByClientId("idle")).toBe(false)

    const handler = vi.fn()
    manager.withAuth(socket, handler)()
    expect(handler).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.UNAUTHORIZED)
  })

  it("keeps a host logged in for as long as they keep making authorized calls", async () => {
    const manager = (await import("@razzia/socket/services/manager")).default
    const { socket } = makeSocket("busy")
    const handler = vi.fn()
    manager.login(socket)

    for (let hour = 0; hour < 48; hour += 6) {
      vi.advanceTimersByTime(6 * HOUR)
      manager.withAuth(socket, handler)()
    }

    expect(handler).toHaveBeenCalledTimes(8)
    expect(manager.isLogged(socket)).toBe(true)
  })

  it("lets a host reconnect to a running game within the window", async () => {
    const manager = (await import("@razzia/socket/services/manager")).default
    const { socket } = makeSocket("reconnecting")
    manager.login(socket)

    vi.advanceTimersByTime(11 * HOUR)

    // A new socket of the same client, like after a dropped connection.
    const { socket: again } = makeSocket("reconnecting")
    expect(manager.isLogged(again)).toBe(true)
    expect(manager.isLoggedByClientId("reconnecting")).toBe(true)
  })

  it("starts a new window when the host logs in again", async () => {
    const manager = (await import("@razzia/socket/services/manager")).default
    const { socket } = makeSocket("again")
    manager.login(socket)
    vi.advanceTimersByTime(11 * HOUR)
    manager.login(socket)
    vi.advanceTimersByTime(11 * HOUR)

    expect(manager.isLogged(socket)).toBe(true)
  })

  it("still logs out on request", async () => {
    const manager = (await import("@razzia/socket/services/manager")).default
    const { socket } = makeSocket("leaving")
    manager.login(socket)
    manager.logout(socket)

    expect(manager.isLogged(socket)).toBe(false)
  })

  it("evicts the least recently used login past the cap", async () => {
    const { default: manager, MAX_LOGGED_CLIENTS } =
      await import("@razzia/socket/services/manager")

    for (let index = 0; index < MAX_LOGGED_CLIENTS; index += 1) {
      manager.login(makeSocket(`client-${index}`).socket)
      vi.advanceTimersByTime(1)
    }

    // The oldest login is used again, so the second oldest is now the one to go.
    expect(manager.isLoggedByClientId("client-0")).toBe(true)
    vi.advanceTimersByTime(1)

    manager.login(makeSocket("newcomer").socket)

    expect(manager.isLoggedByClientId("client-0")).toBe(true)
    expect(manager.isLoggedByClientId("client-1")).toBe(false)
    expect(manager.isLoggedByClientId("newcomer")).toBe(true)
    expect(manager.isLoggedByClientId(`client-${MAX_LOGGED_CLIENTS - 1}`)).toBe(
      true,
    )
  })

  it("drops expired logins when someone logs in, so they never pile up", async () => {
    const { default: manager, MAX_LOGGED_CLIENTS } =
      await import("@razzia/socket/services/manager")

    for (let index = 0; index < 10; index += 1) {
      manager.login(makeSocket(`old-${index}`).socket)
    }

    vi.advanceTimersByTime(13 * HOUR)
    manager.login(makeSocket("fresh").socket)

    const { size } = (
      manager as unknown as { loggedClients: Map<string, number> }
    ).loggedClients

    expect(size).toBe(1)
    expect(size).toBeLessThanOrEqual(MAX_LOGGED_CLIENTS)
  })
})
