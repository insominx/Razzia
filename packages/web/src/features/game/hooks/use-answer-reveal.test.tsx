import { act, renderHook } from "@testing-library/react"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAnswerReveal } from "@razzia/web/features/game/hooks/use-answer-reveal"

const makeData = (
  overrides: Partial<CommonStatusDataMap["SELECT_ANSWER"]> = {},
): CommonStatusDataMap["SELECT_ANSWER"] => ({
  question: "Question",
  questionNumber: 1,
  answers: ["A", "B", "C", "D"],
  time: 10,
  totalPlayer: 2,
  revealStartedAt: 1_000,
  unlockAt: 13_000,
  serverNow: 1_000,
  answeringOpen: false,
  ...overrides,
})

describe("useAnswerReveal", () => {
  let reducedMotion = false
  let changeListener: ((event: MediaQueryListEvent) => void) | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"))
    reducedMotion = false
    changeListener = null
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: reducedMotion,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: (
          _event: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          changeListener = listener
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("waits one second before A, then starts slots every three seconds", async () => {
    const { result } = renderHook(() => useAnswerReveal(makeData()))

    expect(result.current).toBe(0)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(result.current).toBe(0)
    await act(() => vi.advanceTimersByTimeAsync(999))
    expect(result.current).toBe(0)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result.current).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(2_999))
    expect(result.current).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result.current).toBe(2)
    await act(() => vi.advanceTimersByTimeAsync(6_000))
    expect(result.current).toBe(4)
  })

  it("initializes a restamped reconnect at its elapsed slot and catches up", async () => {
    const data = makeData({ serverNow: 5_000 })
    const { result } = renderHook(() => useAnswerReveal(data))

    expect(result.current).toBe(2)
    await act(() => vi.advanceTimersByTimeAsync(2_999))
    expect(result.current).toBe(2)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result.current).toBe(3)
  })

  it("uses server elapsed time despite a far-skewed local wall clock", () => {
    vi.setSystemTime(new Date("2099-12-31T23:59:59.000Z"))
    const { result } = renderHook(() =>
      useAnswerReveal(makeData({ serverNow: 8_250 })),
    )

    expect(result.current).toBe(3)
  })

  it("shows every slot immediately on an open payload and clears reveal work", () => {
    const { result } = renderHook(() =>
      useAnswerReveal(makeData({ answeringOpen: true, serverNow: 1_100 })),
    )

    expect(result.current).toBe(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("projects all slots for reduced motion without changing server phase", () => {
    reducedMotion = true
    const data = makeData()
    const { result } = renderHook(() => useAnswerReveal(data))

    expect(result.current).toBe(4)
    expect(data.answeringOpen).toBe(false)

    reducedMotion = false
    act(() => {
      changeListener?.({ matches: false } as MediaQueryListEvent)
    })
    expect(result.current).toBe(0)
  })

  it("keeps the closed reveal schedule running under reduced motion", () => {
    reducedMotion = true
    const { result } = renderHook(() => useAnswerReveal(makeData()))

    expect(result.current).toBe(4)
    expect(vi.getTimerCount()).toBe(1)
  })

  it("clears the closed reveal timeout when the payload opens", () => {
    const { result, rerender } = renderHook(
      ({ data }) => useAnswerReveal(data),
      { initialProps: { data: makeData() } },
    )

    expect(result.current).toBe(0)
    expect(vi.getTimerCount()).toBe(1)

    rerender({ data: makeData({ answeringOpen: true, serverNow: 1_100 }) })

    expect(result.current).toBe(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("exposes the scheduled count immediately after reduced motion is disabled past the first boundary", async () => {
    reducedMotion = true
    const { result } = renderHook(() => useAnswerReveal(makeData()))

    expect(result.current).toBe(4)
    expect(vi.getTimerCount()).toBe(1)

    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(result.current).toBe(4)

    reducedMotion = false
    act(() => {
      changeListener?.({ matches: false } as MediaQueryListEvent)
    })
    expect(result.current).toBe(1)
  })

  it("keeps one pending timeout and cleans it on unmount", async () => {
    const { unmount } = renderHook(() => useAnswerReveal(makeData()))
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
