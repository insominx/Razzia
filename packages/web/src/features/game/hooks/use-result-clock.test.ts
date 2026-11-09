import {
  RESULT_COUNT_MS,
  RESULT_DONE_MS,
  RESULT_SETTLED_MS,
  RESULT_SPOTLIGHT_MS,
  RESULT_STRIKE_MS,
} from "@razzia/common/utils/result-reveal"
import { useResultClock } from "@razzia/web/features/game/hooks/use-result-clock"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("useResultClock", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts on TIME for a verdict that has only just been sent", () => {
    const { result } = renderHook(() =>
      useResultClock({ resultsAt: 10_000, serverNow: 10_000 }),
    )

    expect(result.current).toEqual({
      elapsedMs: 0,
      phase: "time",
      settled: false,
    })
  })

  it("walks through the beats on the device's own clock", () => {
    const { result } = renderHook(() =>
      useResultClock({ resultsAt: 10_000, serverNow: 10_000 }),
    )

    act(() => {
      vi.advanceTimersByTime(RESULT_COUNT_MS + 25)
    })
    expect(result.current.phase).toBe("count")

    act(() => {
      vi.advanceTimersByTime(RESULT_SPOTLIGHT_MS - RESULT_COUNT_MS)
    })
    expect(result.current.phase).toBe("spotlight")

    act(() => {
      vi.advanceTimersByTime(RESULT_STRIKE_MS - RESULT_SPOTLIGHT_MS)
    })
    expect(result.current.phase).toBe("strike")

    act(() => {
      vi.advanceTimersByTime(RESULT_SETTLED_MS - RESULT_STRIKE_MS)
    })
    expect(result.current.phase).toBe("settled")
    expect(result.current.settled).toBe(true)
  })

  it("lands a late arrival partway in, from the stamps", () => {
    // The verdict was sent 3.2 s ago: this screen starts in the strike.
    const { result } = renderHook(() =>
      useResultClock({ resultsAt: 10_000, serverNow: 13_200 }),
    )

    expect(result.current.phase).toBe("strike")
    expect(result.current.elapsedMs).toBe(3_200)
  })

  it("is settled at once after the reveal has ended: a reconnect, a woken phone", () => {
    const { result } = renderHook(() =>
      useResultClock({ resultsAt: 10_000, serverNow: 60_000 }),
    )

    expect(result.current.settled).toBe(true)
    expect(result.current.phase).toBe("settled")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("is settled with no stamps at all: a saved result shown again", () => {
    const { result } = renderHook(() => useResultClock({}))

    expect(result.current.settled).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("stops ticking once settled, and on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useResultClock({ resultsAt: 10_000, serverNow: 10_000 }),
    )

    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(RESULT_SETTLED_MS + 100)
    })
    expect(result.current.settled).toBe(true)
    // Settled is not done: the fastest player still has a beat to land.
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(RESULT_DONE_MS)
    })
    expect(vi.getTimerCount()).toBe(0)

    unmount()
  })

  it("restarts when the server restamps, as it does on a reconnect", () => {
    const { result, rerender } = renderHook(
      ({ now }: { now: number }) =>
        useResultClock({ resultsAt: 10_000, serverNow: now }),
      { initialProps: { now: 10_000 } },
    )

    expect(result.current.phase).toBe("time")

    rerender({ now: 12_500 })

    expect(result.current.phase).toBe("spotlight")
  })
})
