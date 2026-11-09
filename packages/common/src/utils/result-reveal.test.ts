import {
  getNextResultBoundary,
  getRailOrder,
  getRailStartMs,
  getResultElapsed,
  getResultPhase,
  RESULT_COUNT_MS,
  RESULT_DONE_MS,
  RESULT_FASTEST_MS,
  RESULT_FLOOD_MS,
  RESULT_HEADLINE_MS,
  RESULT_PHONE_DETAILS_MS,
  RESULT_RAIL_GROW_MS,
  RESULT_RAIL_STAGGER_MS,
  RESULT_SETTLED_MS,
  RESULT_SPOTLIGHT_MS,
  RESULT_STRIKE_MS,
} from "@razzia/common/utils/result-reveal"
import { describe, expect, it } from "vitest"

describe("result reveal schedule", () => {
  it("is the plan's beat sheet: TIME, count, question, strike", () => {
    expect(RESULT_COUNT_MS).toBe(600)
    expect(RESULT_SPOTLIGHT_MS).toBe(2_250)
    expect(RESULT_STRIKE_MS).toBe(3_000)
    // Three seconds before the verdict and 1.5 s of flood after it.
    expect(RESULT_SETTLED_MS - RESULT_STRIKE_MS).toBe(RESULT_FLOOD_MS)
    expect(RESULT_SETTLED_MS).toBe(4_500)
  })

  it("keeps the beats in order", () => {
    const beats = [
      0,
      RESULT_COUNT_MS,
      RESULT_SPOTLIGHT_MS,
      RESULT_STRIKE_MS,
      RESULT_SETTLED_MS,
    ]

    expect(beats).toEqual([...beats].sort((a, b) => a - b))
  })

  it("lands the headline and the fastest player after the flood has begun to clear", () => {
    expect(RESULT_HEADLINE_MS).toBeGreaterThan(RESULT_STRIKE_MS)
    expect(RESULT_FASTEST_MS).toBeGreaterThan(RESULT_HEADLINE_MS)
    expect(RESULT_PHONE_DETAILS_MS - RESULT_STRIKE_MS).toBe(2_000)
  })
})

describe("getResultPhase", () => {
  it("names the beat at every boundary, inclusive of its start", () => {
    expect(getResultPhase(0)).toBe("time")
    expect(getResultPhase(RESULT_COUNT_MS - 1)).toBe("time")
    expect(getResultPhase(RESULT_COUNT_MS)).toBe("count")
    expect(getResultPhase(RESULT_SPOTLIGHT_MS - 1)).toBe("count")
    expect(getResultPhase(RESULT_SPOTLIGHT_MS)).toBe("spotlight")
    expect(getResultPhase(RESULT_STRIKE_MS - 1)).toBe("spotlight")
    expect(getResultPhase(RESULT_STRIKE_MS)).toBe("strike")
    expect(getResultPhase(RESULT_SETTLED_MS - 1)).toBe("strike")
    expect(getResultPhase(RESULT_SETTLED_MS)).toBe("settled")
    expect(getResultPhase(60_000)).toBe("settled")
  })

  it("treats a clock that is behind as the start", () => {
    expect(getResultPhase(-250)).toBe("time")
  })
})

describe("getResultElapsed", () => {
  it("is the gap between the two stamps plus the time since it arrived", () => {
    expect(
      getResultElapsed({ resultsAt: 10_000, serverNow: 12_000 }, 500),
    ).toBe(2_500)
  })

  it("starts at zero for a payload sent at the moment answering ended", () => {
    expect(getResultElapsed({ resultsAt: 10_000, serverNow: 10_000 })).toBe(0)
  })

  it("never runs backwards on a skewed stamp", () => {
    expect(getResultElapsed({ resultsAt: 10_000, serverNow: 9_000 })).toBe(0)
  })

  it("is already settled with no stamps: a saved result, or one before this existed", () => {
    expect(getResultElapsed({})).toBe(RESULT_DONE_MS)
    expect(getResultElapsed({ resultsAt: 10_000 })).toBe(RESULT_DONE_MS)
    expect(getResultPhase(getResultElapsed({}))).toBe("settled")
  })
})

describe("getNextResultBoundary", () => {
  it("finds the next beat, and stops once settled", () => {
    expect(getNextResultBoundary(0)).toBe(RESULT_COUNT_MS)
    expect(getNextResultBoundary(RESULT_COUNT_MS)).toBe(RESULT_SPOTLIGHT_MS)
    expect(getNextResultBoundary(2_500)).toBe(RESULT_STRIKE_MS)
    expect(getNextResultBoundary(RESULT_STRIKE_MS)).toBe(RESULT_HEADLINE_MS)
    expect(getNextResultBoundary(RESULT_HEADLINE_MS)).toBe(RESULT_SETTLED_MS)
    expect(getNextResultBoundary(RESULT_SETTLED_MS)).toBe(RESULT_FASTEST_MS)
    expect(getNextResultBoundary(RESULT_DONE_MS)).toBeNull()
  })

  it("runs long enough for every late line to land", () => {
    expect(RESULT_DONE_MS).toBeGreaterThanOrEqual(RESULT_HEADLINE_MS)
    expect(RESULT_DONE_MS).toBeGreaterThanOrEqual(RESULT_FASTEST_MS)
    expect(RESULT_DONE_MS).toBeGreaterThanOrEqual(RESULT_PHONE_DETAILS_MS)
  })
})

describe("rails", () => {
  it("grows smallest first, ties in slot order", () => {
    expect(getRailOrder([3, 8, 4, 2])).toEqual([3, 0, 2, 1])
    expect(getRailOrder([5, 5, 1])).toEqual([2, 0, 1])
    expect(getRailOrder([0, 0, 0, 0])).toEqual([0, 1, 2, 3])
  })

  it("starts each rail one stagger after the last, from the count", () => {
    expect(getRailStartMs(0)).toBe(RESULT_COUNT_MS)
    expect(getRailStartMs(1)).toBe(RESULT_COUNT_MS + RESULT_RAIL_STAGGER_MS)
    expect(getRailStartMs(-1)).toBe(RESULT_COUNT_MS)
  })

  it("finishes the biggest rail before the question goes dark", () => {
    const lastStart = getRailStartMs(3)

    expect(lastStart + RESULT_RAIL_GROW_MS).toBeLessThanOrEqual(
      RESULT_SPOTLIGHT_MS,
    )
  })
})
