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

describe("Registry expiry for lecture games", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("holds a lecture game for 30 minutes after its host drops", async () => {
    const registry = await freshRegistry()
    const close = vi.fn()
    const game = { gameId: "lecture", lecture: true, close } as unknown as Game
    registry.addGame(game)
    registry.markGameAsEmpty(game)

    await vi.advanceTimersByTimeAsync(29 * 60_000)
    expect(close).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(close).toHaveBeenCalledWith("errors:game.managerDisconnected")
    expect(registry.getGameById("lecture")).toBeUndefined()
  })

  it("still expires a normal game after 5 minutes", async () => {
    const registry = await freshRegistry()
    const closeLecture = vi.fn()
    const closeNormal = vi.fn()
    const lecture = {
      gameId: "lecture",
      lecture: true,
      close: closeLecture,
    } as unknown as Game
    const normal = { gameId: "normal", close: closeNormal } as unknown as Game
    registry.addGame(lecture)
    registry.addGame(normal)
    registry.markGameAsEmpty(lecture)
    registry.markGameAsEmpty(normal)

    await vi.advanceTimersByTimeAsync(6 * 60_000)

    expect(closeNormal).toHaveBeenCalledTimes(1)
    expect(closeLecture).not.toHaveBeenCalled()
    expect(registry.getGameById("lecture")).toBe(lecture)
  })
})
