import { act, renderHook } from "@testing-library/react"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import {
  getQuestionPromptRevealMs,
  getQuestionSentenceStartElapsed,
} from "@razzia/common/utils/question-transition"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useQuestionPrompt } from "@razzia/web/features/game/hooks/use-question-prompt"

const FOUR =
  "You host a game at home. Your friend's home uses the same private address range as yours. They enter your PC's private LAN address to join. Where does their PC look for that destination?"
const revealMs = getQuestionPromptRevealMs(FOUR)
const secondAt = getQuestionSentenceStartElapsed(FOUR, 1)
const thirdAt = getQuestionSentenceStartElapsed(FOUR, 2)
const fourthAt = getQuestionSentenceStartElapsed(FOUR, 3)

const makeData = (
  overrides: Partial<CommonStatusDataMap["SHOW_QUESTION"]> = {},
): CommonStatusDataMap["SHOW_QUESTION"] => ({
  question: FOUR,
  questionNumber: 1,
  cooldown: 5,
  promptStartedAt: 1_000,
  serverNow: 1_000,
  ...overrides,
})

describe("useQuestionPrompt", () => {
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

  it("shows the first sentence immediately, then the next on the character clock", async () => {
    const { result } = renderHook(() => useQuestionPrompt(makeData()))

    expect(result.current.visibleCount).toBe(1)
    expect(result.current.barDelayMs).toBe(revealMs)
    expect(result.current.shouldLift).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(secondAt - 1))
    expect(result.current.visibleCount).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result.current.visibleCount).toBe(2)
    await act(() => vi.advanceTimersByTimeAsync(fourthAt - secondAt))
    expect(result.current.visibleCount).toBe(4)
  })

  it("initializes a restamped reconnect at its elapsed sentence and catches up", async () => {
    const data = makeData({ serverNow: 1_000 + thirdAt })
    const { result } = renderHook(() => useQuestionPrompt(data))

    expect(result.current.visibleCount).toBe(3)
    expect(result.current.barDelayMs).toBe(revealMs - thirdAt)
    expect(result.current.shouldLift).toBe(false)
    await act(() => vi.advanceTimersByTimeAsync(fourthAt - thirdAt - 1))
    expect(result.current.visibleCount).toBe(3)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result.current.visibleCount).toBe(4)
  })

  it("uses a negative bar delay when reconnecting mid-cooldown", () => {
    const { result } = renderHook(() =>
      useQuestionPrompt(makeData({ serverNow: 1_000 + revealMs + 1_000 })),
    )

    expect(result.current.visibleCount).toBe(4)
    expect(result.current.barDelayMs).toBe(-1_000)
  })

  it("keeps one-sentence prompts on the 950 ms entrance clock", () => {
    const { result } = renderHook(() =>
      useQuestionPrompt(makeData({ question: "Pick one" })),
    )

    expect(result.current.visibleCount).toBe(1)
    expect(result.current.barDelayMs).toBe(950)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("projects every sentence for reduced motion without starting the bar early", () => {
    reducedMotion = true
    const { result } = renderHook(() => useQuestionPrompt(makeData()))

    expect(result.current.visibleCount).toBe(4)
    expect(result.current.barDelayMs).toBe(revealMs)
    expect(vi.getTimerCount()).toBe(1)

    reducedMotion = false
    act(() => {
      changeListener?.({ matches: false } as MediaQueryListEvent)
    })
    expect(result.current.visibleCount).toBe(1)
  })

  it("keeps one pending timeout and cleans it on unmount", async () => {
    const { unmount } = renderHook(() => useQuestionPrompt(makeData()))
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
