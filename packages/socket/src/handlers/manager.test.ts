import { EVENTS } from "@razzia/common/constants"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import type { SocketContext } from "@razzia/socket/handlers/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  registry: {
    getGamesByManagerSocketId: vi.fn((): unknown[] => []),
    markGameAsEmpty: vi.fn(),
  },
  config: {
    managerPassword: "secret",
    visuals: {},
  },
  getGameConfig: vi.fn(),
  updateGameConfig: vi.fn(),
}))

vi.mock("@razzia/socket/services/registry", () => ({
  default: { getInstance: () => mocks.registry },
}))

vi.mock("@razzia/socket/services/config", () => ({
  getGameConfig: mocks.getGameConfig,
  updateGameConfig: mocks.updateGameConfig,
  getQuizzMeta: () => [],
  getResultsMeta: () => [],
}))

vi.mock("@razzia/socket/services/visuals", () => ({
  resolveVisuals: () => ({}),
  setGlobalBackground: vi.fn(),
  clearGlobalBackground: vi.fn(),
}))

type Handler = (...args: never[]) => void

const connect = async (clientId: string, address = "10.0.0.1") => {
  const handlers = new Map<string, Handler>()
  const emit = vi.fn()
  const socket = {
    id: `socket-${clientId}`,
    handshake: { auth: { clientId }, address },
    emit,
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler)
    }),
  } as unknown as Socket
  const { managerSocketHandlers } =
    await import("@razzia/socket/handlers/manager")

  managerSocketHandlers({ io: {} as Server, socket } as SocketContext)

  return { handlers, emit, socket }
}

const loadManager = async () =>
  (await import("@razzia/socket/services/manager")).default

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.getGameConfig.mockReturnValue(mocks.config)
})

describe("managerSocketHandlers password guessing", () => {
  it("locks a remote address out after a run of wrong guesses, even for the right one", async () => {
    const { handlers, emit, socket } = await connect("attacker")
    const manager = await loadManager()

    for (let i = 0; i < 6; i += 1) {
      handlers.get(EVENTS.MANAGER.AUTH)?.(`guess-${i}` as never)
    }

    emit.mockClear()
    handlers.get(EVENTS.MANAGER.AUTH)?.("secret" as never)

    expect(emit).toHaveBeenCalledWith(
      EVENTS.MANAGER.ERROR_MESSAGE,
      "errors:manager.tooManyAttempts",
    )
    expect(manager.isLogged(socket)).toBe(false)
  })

  it("does not let fresh sockets and client ids from one address start over", async () => {
    await Promise.all(
      Array.from({ length: 31 }, async (_, i) => {
        const sweeper = await connect(`attacker-${i}`, "10.9.9.9")
        sweeper.handlers.get(EVENTS.MANAGER.AUTH)?.(`guess-${i}` as never)
      }),
    )

    const next = await connect("attacker-next", "10.9.9.9")
    next.handlers.get(EVENTS.MANAGER.AUTH)?.("secret" as never)

    expect(next.emit).toHaveBeenCalledWith(
      EVENTS.MANAGER.ERROR_MESSAGE,
      "errors:manager.tooManyAttempts",
    )
  })

  it("never locks a logged-in teacher out, however many guesses the address sees", async () => {
    const teacher = await connect("teacher-client-id", "192.168.7.7")
    const manager = await loadManager()
    teacher.handlers.get(EVENTS.MANAGER.AUTH)?.("secret" as never)
    expect(manager.isLogged(teacher.socket)).toBe(true)

    await Promise.all(
      Array.from({ length: 80 }, async (_, i) => {
        const attacker = await connect(`flood-${i}-client-id`, "192.168.7.7")
        attacker.handlers.get(EVENTS.MANAGER.AUTH)?.(`guess-${i}` as never)
      }),
    )

    // A fresh stranger on the address is now locked out...
    const stranger = await connect("stranger-client-id", "192.168.7.7")
    stranger.handlers.get(EVENTS.MANAGER.AUTH)?.("secret" as never)
    expect(stranger.emit).toHaveBeenCalledWith(
      EVENTS.MANAGER.ERROR_MESSAGE,
      "errors:manager.tooManyAttempts",
    )

    // ...but the teacher's reloaded page still gets in.
    manager.logout(teacher.socket)
    const reloaded = await connect("teacher-client-id", "192.168.7.7")
    reloaded.handlers.get(EVENTS.MANAGER.AUTH)?.("secret" as never)
    expect(manager.isLogged(reloaded.socket)).toBe(true)
  })

  it("does not lock the teacher out because one student guessed at the password", async () => {
    const student = await connect("student", "192.168.7.7")

    for (let i = 0; i < 6; i += 1) {
      student.handlers.get(EVENTS.MANAGER.AUTH)?.(`guess-${i}` as never)
    }

    const teacher = await connect("teacher-in-same-room", "192.168.7.7")
    const manager = await loadManager()
    teacher.handlers.get(EVENTS.MANAGER.AUTH)?.("secret" as never)

    expect(manager.isLogged(teacher.socket)).toBe(true)
  })

  it("logs in with the right password after a few misses", async () => {
    const { handlers, socket } = await connect("teacher", "10.2.2.2")
    const manager = await loadManager()

    for (let i = 0; i < 3; i += 1) {
      handlers.get(EVENTS.MANAGER.AUTH)?.("wrong" as never)
    }

    handlers.get(EVENTS.MANAGER.AUTH)?.("secret" as never)

    expect(manager.isLogged(socket)).toBe(true)
  })
})

describe("managerSocketHandlers logout", () => {
  it("takes hosted games out of the logged-out socket's hands", async () => {
    const { handlers, socket } = await connect("host", "10.3.3.3")
    const manager = await loadManager()
    const game = { setManagerDisconnected: vi.fn() }
    manager.login(socket)
    mocks.registry.getGamesByManagerSocketId.mockReturnValueOnce([game])

    handlers.get(EVENTS.MANAGER.LOGOUT)?.()

    expect(manager.isLogged(socket)).toBe(false)
    expect(mocks.registry.getGamesByManagerSocketId).toHaveBeenCalledWith(
      socket.id,
    )
    expect(game.setManagerDisconnected).toHaveBeenCalledTimes(1)
    expect(mocks.registry.markGameAsEmpty).toHaveBeenCalledWith(game)
  })
})

describe("managerSocketHandlers GET_CONFIG", () => {
  it("tells a logged-in host when the config cannot be read", async () => {
    const { handlers, emit, socket } = await connect("host", "10.6.6.6")
    const manager = await loadManager()
    manager.login(socket)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.getGameConfig.mockImplementation(() => {
      throw new Error("Unexpected token in game.json")
    })

    expect(() => handlers.get(EVENTS.MANAGER.GET_CONFIG)?.()).not.toThrow()

    expect(emit).toHaveBeenCalledWith(
      EVENTS.MANAGER.ERROR_MESSAGE,
      "errors:manager.failedToReadConfig",
    )
    expect(emit).not.toHaveBeenCalledWith(
      EVENTS.MANAGER.CONFIG,
      expect.anything(),
    )
  })

  it("sends the config when it reads fine", async () => {
    const { handlers, emit, socket } = await connect("host", "10.6.6.7")
    const manager = await loadManager()
    manager.login(socket)

    handlers.get(EVENTS.MANAGER.GET_CONFIG)?.()

    expect(emit).toHaveBeenCalledWith(EVENTS.MANAGER.CONFIG, expect.anything())
  })
})

describe("managerSocketHandlers config changes", () => {
  it("reports a refresh failure after a saved change as success", async () => {
    const { handlers, socket } = await connect("host", "10.4.4.4")
    const manager = await loadManager()
    manager.login(socket)
    const failReadBack = () => {
      throw new Error("Unexpected token in game.json")
    }

    mocks.updateGameConfig.mockImplementationOnce(() => {
      // The change is written; reading the config back for the refresh fails.
      mocks.getGameConfig.mockImplementation(failReadBack)
    })
    const ack = vi.fn()

    handlers.get(EVENTS.MANAGER.DIALECT_SET)?.(
      { dialect: "stage-studio" } as never,
      ack as never,
    )

    expect(mocks.updateGameConfig).toHaveBeenCalledTimes(1)
    expect(ack).toHaveBeenCalledWith({ ok: true })
  })

  it("never sends raw error text to the client", async () => {
    const { handlers, socket } = await connect("host", "10.5.5.5")
    const manager = await loadManager()
    manager.login(socket)
    mocks.updateGameConfig.mockImplementationOnce(() => {
      throw new Error("EACCES: permission denied, open 'game.json'")
    })
    const ack = vi.fn()

    handlers.get(EVENTS.MANAGER.SOUND_THEME_SET)?.(
      { soundTheme: "techno" } as never,
      ack as never,
    )

    expect(ack).toHaveBeenCalledWith({
      error: "errors:visuals.soundThemeSetFailed",
    })
  })
})
