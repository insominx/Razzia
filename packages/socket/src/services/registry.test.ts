import type Game from "@razzia/socket/services/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("Registry expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("closes a game its manager abandoned before dropping it", async () => {
    const { default: Registry } =
      await import("@razzia/socket/services/registry")
    const registry = Registry.getInstance()
    const close = vi.fn()
    const game = { gameId: "abandoned", close } as unknown as Game
    registry.addGame(game)
    registry.markGameAsEmpty(game)

    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(close).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(close).toHaveBeenCalledWith("errors:game.managerDisconnected")
    expect(registry.getGameById("abandoned")).toBeUndefined()

    registry.cleanup()
  })
})
