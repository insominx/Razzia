import {
  RING_CIRCUMFERENCE,
  ringDashOffset,
  ringProgress,
} from "@razzia/web/features/game/utils/timer-ring"
import { describe, expect, it } from "vitest"

describe("ringProgress", () => {
  it("is full while the whole cooldown remains", () => {
    expect(ringProgress(20, 20)).toBe(1)
  })

  it("is empty once the cooldown is spent", () => {
    expect(ringProgress(0, 20)).toBe(0)
  })

  it("tracks the remaining fraction", () => {
    expect(ringProgress(5, 20)).toBe(0.25)
  })

  it("clamps a remaining value outside the cooldown", () => {
    expect(ringProgress(25, 20)).toBe(1)
    expect(ringProgress(-3, 20)).toBe(0)
  })

  it("stays full when there is no cooldown to count down", () => {
    expect(ringProgress(0, 0)).toBe(1)
    expect(ringProgress(5, -1)).toBe(1)
    expect(ringProgress(Number.NaN, 20)).toBe(1)
  })
})

describe("ringDashOffset", () => {
  it("hides no stroke while full and all of it when spent", () => {
    expect(ringDashOffset(20, 20, 100)).toBe(0)
    expect(ringDashOffset(0, 20, 100)).toBe(100)
  })

  it("defaults to the shared ring circumference", () => {
    expect(ringDashOffset(10, 20)).toBeCloseTo(RING_CIRCUMFERENCE / 2)
  })
})
