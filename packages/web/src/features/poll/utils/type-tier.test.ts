import {
  OPTION_CLASSES,
  optionTier,
  QUESTION_CLASSES,
  questionTier,
} from "@razzia/web/features/poll/utils/type-tier"
import { describe, expect, it } from "vitest"

describe("poll type tiers", () => {
  it("sizes a question from its length alone", () => {
    expect(questionTier("Ready?")).toBe("short")
    expect(questionTier("x".repeat(70))).toBe("short")
    expect(questionTier("x".repeat(71))).toBe("medium")
    expect(questionTier("x".repeat(160))).toBe("medium")
    expect(questionTier("x".repeat(161))).toBe("long")
  })

  it("sizes every option from the longest, so the rows stay alike", () => {
    expect(optionTier(["Yes", "No"])).toBe("short")
    expect(optionTier(["Yes", "x".repeat(40)])).toBe("medium")
    expect(optionTier(["Yes", "x".repeat(61)])).toBe("long")
    expect(optionTier([])).toBe("short")
  })

  it("never sets room-readable text below 2.6875rem on the stage", () => {
    for (const classes of [
      ...Object.values(QUESTION_CLASSES),
      ...Object.values(OPTION_CLASSES),
    ]) {
      const stage = /stage:text-\[([\d.]+)rem\]/u.exec(classes)

      expect(stage).not.toBeNull()
      expect(Number(stage?.[1])).toBeGreaterThanOrEqual(2.6875)
    }
  })
})
