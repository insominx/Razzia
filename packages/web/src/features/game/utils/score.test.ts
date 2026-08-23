import { calculatePercentages } from "@razzia/web/features/game/utils/score"
import { describe, expect, it } from "vitest"

describe("calculatePercentages", () => {
  it("splits the vote across the answered slots", () => {
    expect(calculatePercentages({ 0: 12, 1: 2, 2: 3, 3: 1 })).toEqual({
      0: "67%",
      1: "11%",
      2: "17%",
      3: "6%",
    })
  })

  // The reveal bars read the result as a width, and an unguarded divide would
  // hand them `NaN%` — which paints a full bar, not an empty one.
  it("zeroes every slot when nobody answered", () => {
    expect(calculatePercentages({ 0: 0, 1: 0, 2: 0, 3: 0 })).toEqual({
      0: "0%",
      1: "0%",
      2: "0%",
      3: "0%",
    })
  })

  it("has nothing to split when there are no slots", () => {
    expect(calculatePercentages({})).toEqual({})
  })
})
