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

// Each test gets its own singleton, with its expiry task on fake timers.
const freshRegistry = async () => {
  vi.resetModules()
  const { default: Registry } = await import("@razzia/socket/services/registry")
  const registry = Registry.getInstance()
  onTestFinished(() => {
    registry.cleanup()
  })

  return registry
}

describe("Registry expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("closes a game its manager abandoned before dropping it", async () => {
    const registry = await freshRegistry()
    const close = vi.fn()
    const game = { gameId: "abandoned", close } as unknown as Game
    registry.addGame(game)
    registry.markGameAsEmpty(game)

    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(close).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(close).toHaveBeenCalledWith("errors:game.managerDisconnected")
    expect(registry.getGameById("abandoned")).toBeUndefined()
  })

  it("keeps expiring the other games when closing one fails", async () => {
    const registry = await freshRegistry()
    const broken = {
      gameId: "broken",
      close: vi.fn(() => {
        throw new Error("close failed")
      }),
    } as unknown as Game
    const close = vi.fn()
    const healthy = { gameId: "healthy", close } as unknown as Game
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    registry.addGame(broken)
    registry.addGame(healthy)
    registry.markGameAsEmpty(broken)
    registry.markGameAsEmpty(healthy)

    await vi.advanceTimersByTimeAsync(6 * 60_000)

    expect(close).toHaveBeenCalledTimes(1)
    expect(registry.getGameById("broken")).toBeUndefined()
    expect(registry.getGameById("healthy")).toBeUndefined()
  })
})
