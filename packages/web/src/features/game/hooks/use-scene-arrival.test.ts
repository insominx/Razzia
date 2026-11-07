import { useSceneArrival } from "@razzia/web/features/game/hooks/use-scene-arrival"
import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const verdict = (serverNow: number) => ({
  scene: "verdict" as const,
  resultsAt: 1_000,
  serverNow,
  votes: [1, 0],
  outcome: "right" as const,
})

describe("useSceneArrival", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("leaves a scene alone the first time it is asked for", () => {
    const { result } = renderHook(() => useSceneArrival(1_000))

    expect(result.current(verdict(1_000))).toEqual(verdict(1_000))
  })

  it("moves the payload's clock on by the time it has been here", () => {
    const { result } = renderHook(() => useSceneArrival(1_000))

    result.current(verdict(1_000))
    vi.advanceTimersByTime(12_000)

    expect(result.current(verdict(1_000))).toEqual(verdict(13_000))
  })

  it("starts afresh with a new payload", () => {
    const { result, rerender } = renderHook(
      ({ serverNow }) => useSceneArrival(serverNow),
      { initialProps: { serverNow: 1_000 } },
    )

    result.current(verdict(1_000))
    vi.advanceTimersByTime(12_000)
    rerender({ serverNow: 9_000 })

    expect(result.current(verdict(9_000))).toEqual(verdict(9_000))
  })

  it("leaves an unstamped scene alone", () => {
    const { result } = renderHook(() => useSceneArrival(undefined))

    result.current({ scene: "title" })
    vi.advanceTimersByTime(5_000)

    expect(result.current({ scene: "title" })).toEqual({ scene: "title" })
  })
})
