import {
  ANSWER_REVEAL_FADE_MS,
  ANSWER_REVEAL_HOLD_MS,
  ANSWER_REVEAL_INITIAL_DELAY_MS,
  ANSWER_REVEAL_SLOT_INTERVAL_MS,
  getAnswerRevealDuration,
  getNextAnswerRevealElapsed,
  getVisibleAnswerCount,
} from "@razzia/common/utils/answer-reveal"
import { describe, expect, it } from "vitest"

describe("answer reveal schedule", () => {
  it("locks the initial delay, fade, hold, and slot interval", () => {
    expect(ANSWER_REVEAL_INITIAL_DELAY_MS).toBe(1_000)
    expect(ANSWER_REVEAL_FADE_MS).toBe(2_000)
    expect(ANSWER_REVEAL_HOLD_MS).toBe(1_000)
    expect(ANSWER_REVEAL_SLOT_INTERVAL_MS).toBe(3_000)
  })

  it.each([
    [2, 6_000],
    [3, 9_000],
    [4, 12_000],
  ])("finishes %i answers at the final fade end", (count, duration) => {
    expect(getAnswerRevealDuration(count)).toBe(duration)
  })

  it("changes visibility only at slot-start boundaries", () => {
    expect(getVisibleAnswerCount(4, -1)).toBe(0)
    expect(getVisibleAnswerCount(4, 999)).toBe(0)
    expect(getVisibleAnswerCount(4, 1_000)).toBe(1)
    expect(getVisibleAnswerCount(4, 3_999)).toBe(1)
    expect(getVisibleAnswerCount(4, 4_000)).toBe(2)
    expect(getVisibleAnswerCount(4, 6_999)).toBe(2)
    expect(getVisibleAnswerCount(4, 7_000)).toBe(3)
    expect(getVisibleAnswerCount(4, 10_000)).toBe(4)
  })

  it("clamps malformed counts and elapsed projections", () => {
    expect(getAnswerRevealDuration(0)).toBe(0)
    expect(getAnswerRevealDuration(-2)).toBe(0)
    expect(getVisibleAnswerCount(2, Number.MAX_SAFE_INTEGER)).toBe(2)
    expect(getVisibleAnswerCount(-1, 0)).toBe(0)
  })

  it("returns the next slot threshold until all slots are visible", () => {
    expect(getNextAnswerRevealElapsed(4, 0)).toBe(1_000)
    expect(getNextAnswerRevealElapsed(4, 1)).toBe(4_000)
    expect(getNextAnswerRevealElapsed(4, 3)).toBe(10_000)
    expect(getNextAnswerRevealElapsed(4, 4)).toBeNull()
  })
})
