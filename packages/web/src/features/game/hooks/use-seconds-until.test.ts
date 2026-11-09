import { useSecondsUntil } from "@razzia/web/features/game/hooks/use-seconds-until"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("useSecondsUntil", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("counts whole seconds, rounding up, on the server's clock", () => {
    // The server says it is 1 000 ms; the answers open at 8 000 ms.
    const { result } = renderHook(() => useSecondsUntil(8_000, 1_000))

    expect(result.current).toBe(7)
  })

  it("counts down with this device's own clock between payloads", () => {
    const { result } = renderHook(() => useSecondsUntil(8_000, 1_000))

    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(result.current).toBe(4)

    act(() => {
      vi.advanceTimersByTime(3_900)
    })
    expect(result.current).toBe(1)
  })

  it("stops at zero rather than going negative", () => {
    const { result } = renderHook(() => useSecondsUntil(8_000, 1_000))

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current).toBe(0)
  })

  it("agrees with the room however wrong this device's clock is", () => {
    vi.setSystemTime(new Date("1999-12-31T23:59:59.000Z"))

    const { result } = renderHook(() => useSecondsUntil(8_000, 1_000))

    expect(result.current).toBe(7)
  })

  it("starts over when the server restamps, as it does on a reconnect", () => {
    const { result, rerender } = renderHook(
      ({ now }: { now: number }) => useSecondsUntil(8_000, now),
      { initialProps: { now: 1_000 } },
    )

    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(result.current).toBe(5)

    rerender({ now: 6_000 })
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(result.current).toBe(2)
  })

  it("holds still while it is not wanted, and stops its timer on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useSecondsUntil(8_000, 1_000, false),
    )

    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(result.current).toBe(7)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
