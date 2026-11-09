import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import {
  useCalmVisuals,
  useShowIntensity,
} from "@razzia/web/features/game/hooks/use-show-intensity"
import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const motion = vi.hoisted(() => ({ reduced: false as boolean | null }))

vi.mock("motion/react", () => ({
  useReducedMotion: () => motion.reduced,
}))

describe("useShowIntensity", () => {
  afterEach(() => {
    usePlayerStore.getState().reset()
    useManagerStore.getState().reset()
    motion.reduced = false
  })

  it("is the full show when nothing says otherwise", () => {
    expect(renderHook(() => useShowIntensity()).result.current).toBe("full")
    expect(renderHook(() => useCalmVisuals()).result.current).toBe(false)
  })

  it("reads the host's snapshot on the projector", () => {
    useManagerStore.getState().setVisuals({ showIntensity: "calm" })

    expect(renderHook(() => useShowIntensity()).result.current).toBe("calm")
  })

  it("reads the player's own snapshot once joined", () => {
    useManagerStore.getState().setVisuals({ showIntensity: "full" })
    usePlayerStore.getState().setGameId("game-1")
    usePlayerStore.getState().setVisuals({ showIntensity: "silent" })

    expect(renderHook(() => useShowIntensity()).result.current).toBe("silent")
  })

  it("is calm for Calm and Silent, but not Full", () => {
    useManagerStore.getState().setVisuals({ showIntensity: "calm" })
    expect(renderHook(() => useCalmVisuals()).result.current).toBe(true)

    useManagerStore.getState().setVisuals({ showIntensity: "silent" })
    expect(renderHook(() => useCalmVisuals()).result.current).toBe(true)

    useManagerStore.getState().setVisuals({ showIntensity: "full" })
    expect(renderHook(() => useCalmVisuals()).result.current).toBe(false)
  })

  it("is calm on a device set to reduced motion, whatever the setting", () => {
    motion.reduced = true
    useManagerStore.getState().setVisuals({ showIntensity: "full" })

    expect(renderHook(() => useCalmVisuals()).result.current).toBe(true)
    // The setting itself is untouched: audio does not follow reduced motion.
    expect(renderHook(() => useShowIntensity()).result.current).toBe("full")
  })
})
