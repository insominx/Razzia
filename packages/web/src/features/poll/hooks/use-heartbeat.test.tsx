import {
  beatMs,
  HEARTBEAT_BPM,
  useHeartbeat,
} from "@razzia/web/features/poll/hooks/use-heartbeat"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ cue: vi.fn() }))

vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: { cue: mocks.cue },
}))

describe("useHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.cue.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("quickens from its slowest to its fastest as the room fills", () => {
    expect(beatMs(0)).toBeCloseTo(60_000 / HEARTBEAT_BPM.from)
    expect(beatMs(1)).toBeCloseTo(60_000 / HEARTBEAT_BPM.to)
    expect(beatMs(2)).toBe(beatMs(1))
  })

  it("is quiet until it is active, then beats at once and keeps time", () => {
    const { result, rerender } = renderHook(
      ({ active, share }) => useHeartbeat(active, share),
      { initialProps: { active: false, share: 0 } },
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.cue).not.toHaveBeenCalled()
    expect(result.current).toBe(0)

    rerender({ active: true, share: 0.5 })
    expect(mocks.cue).toHaveBeenCalledTimes(1)
    expect(mocks.cue).toHaveBeenLastCalledWith({
      cue: "beat",
      strength: 0.55 + 0.45 * 0.5,
    })
    expect(result.current).toBe(1)

    act(() => {
      vi.advanceTimersByTime(beatMs(0.5))
    })
    expect(mocks.cue).toHaveBeenCalledTimes(2)
    expect(result.current).toBe(2)
  })

  it("follows the share between beats without restarting", () => {
    const { rerender } = renderHook(
      ({ active, share }) => useHeartbeat(active, share),
      { initialProps: { active: true, share: 0 } },
    )

    rerender({ active: true, share: 1 })
    expect(mocks.cue).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(beatMs(0))
    })
    expect(mocks.cue).toHaveBeenLastCalledWith({ cue: "beat", strength: 1 })
  })

  it("stops when it is no longer active, with no closing beat", () => {
    const { rerender } = renderHook(({ active }) => useHeartbeat(active, 0.9), {
      initialProps: { active: true },
    })

    rerender({ active: false })
    mocks.cue.mockClear()

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(mocks.cue).not.toHaveBeenCalled()
  })
})
