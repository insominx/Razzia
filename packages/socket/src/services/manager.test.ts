import { beforeEach, describe, expect, it, vi } from "vitest"
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
      error: "errors:failedToReadConfig",
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
