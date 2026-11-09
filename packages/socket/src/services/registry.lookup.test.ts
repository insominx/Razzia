import type Game from "@razzia/socket/services/game"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest"

const freshRegistry = async () => {
  vi.resetModules()
  const { default: Registry } = await import("@razzia/socket/services/registry")
  const registry = Registry.getInstance()
  onTestFinished(() => {
    registry.cleanup()
  })

  return registry
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("Registry lookups", () => {
  const game = {
    gameId: "g1",
    manager: { clientId: "host-client" },
    players: [{ clientId: "player-client" }],
    close: vi.fn(),
  } as unknown as Game

  it("matches the host only by gameId and clientId", async () => {
    const registry = await freshRegistry()
    registry.addGame(game)

    expect(registry.getManagerGame("g1", "host-client")).toBe(game)
    expect(registry.getManagerGame("g1", "stranger")).toBeUndefined()
    expect(registry.getManagerGame("g1", "player-client")).toBeUndefined()
    expect(registry.getManagerGame("other", "host-client")).toBeUndefined()
  })

  it("matches a player only by gameId and clientId", async () => {
    const registry = await freshRegistry()
    registry.addGame(game)

    expect(registry.getPlayerGame("g1", "player-client")).toBe(game)
    expect(registry.getPlayerGame("g1", "stranger")).toBeUndefined()
    expect(registry.getPlayerGame("g1", "host-client")).toBeUndefined()
    expect(registry.getPlayerGame("other", "player-client")).toBeUndefined()
  })
})

describe("Registry reactivation", () => {
  it("keeps a game whose host came back from expiring", async () => {
    const registry = await freshRegistry()
    const close = vi.fn()
    const game = { gameId: "back", close } as unknown as Game
    registry.addGame(game)
    registry.markGameAsEmpty(game)

    await vi.advanceTimersByTimeAsync(4 * 60_000)
    registry.reactivateGame("back")
    await vi.advanceTimersByTimeAsync(10 * 60_000)

    expect(close).not.toHaveBeenCalled()
    expect(registry.getEmptyGameCount()).toBe(0)
    expect(registry.getGameById("back")).toBe(game)
  })
})
