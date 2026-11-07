import {
  answerFontRem,
  PROMPT_BUDGET_REM,
  PROMPT_TIERS,
  promptHeightRem,
  promptSentences,
  promptTier,
  promptVars,
} from "@razzia/web/features/game/utils/type-tier"
import { describe, expect, it } from "vitest"

const SHORT = "What happens?"
const MEDIUM =
  "Two Bézier segments share an endpoint, but the camera changes direction abruptly as it crosses the join. What should you adjust to remove the corner?"
const LONG = `A 1 Hz spring has no damping and should keep swinging at roughly the same size. At a steady 60 fps, each swing grows. SimulateSpring ends with:

currentPos += _velocity * deltaTime;
_velocity += acceleration * deltaTime;

What is the fix?`

describe("promptTier", () => {
  it("gives a short question the biggest type", () => {
    expect(promptTier(SHORT)).toBe(PROMPT_TIERS[0])
  })

  it("steps down as the prompt gets longer, never growing back", () => {
    const sizes = [SHORT, MEDIUM, LONG].map((q) => promptTier(q).ask)

    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
    expect(sizes[2]).toBeLessThan(sizes[0])
  })

  it("never lets the room-readable copy fall under 43 px at 1080p", () => {
    for (const tier of PROMPT_TIERS) {
      expect(tier.ctx).toBeGreaterThanOrEqual(2.6875)
      expect(tier.ask).toBeGreaterThan(tier.ctx)
    }
  })

  it("fits the budget at the chosen tier when any tier can", () => {
    for (const question of [SHORT, MEDIUM, LONG]) {
      const tier = promptTier(question)

      expect(promptHeightRem(question, tier)).toBeLessThanOrEqual(
        PROMPT_BUDGET_REM,
      )
    }
  })

  it("takes the smallest tier for a prompt nothing fits", () => {
    const huge = Array.from({ length: 40 }, () => MEDIUM).join(" ")

    expect(promptTier(huge)).toBe(PROMPT_TIERS[PROMPT_TIERS.length - 1])
  })

  it("is decided by the question alone, so every screen agrees", () => {
    expect(promptTier(MEDIUM)).toBe(promptTier(MEDIUM))
    expect(promptVars(MEDIUM)).toEqual(promptVars(MEDIUM))
  })

  it("counts a newline as a line even when the row is short", () => {
    const code = "Look:\na\nb\nc\nd\nWhat?"

    expect(promptHeightRem(code, PROMPT_TIERS[0])).toBeGreaterThan(
      promptHeightRem("Look: a b c d What?", PROMPT_TIERS[0]),
    )
  })
})

describe("promptSentences", () => {
  it("makes a single sentence the ask", () => {
    expect(promptSentences(SHORT)).toEqual([{ lead: "", ask: SHORT }])
  })

  it("keeps the server's sentence order, with the ask last", () => {
    const [first, second] = promptSentences(MEDIUM)

    expect(first.ask).toBeNull()
    expect(first.lead).toContain("Two Bézier segments")
    expect(second.ask).toContain("What should you adjust")
  })

  it("asks on the last line, and sets a code block above it as context", () => {
    const sentences = promptSentences(LONG)
    const last = sentences[sentences.length - 1]

    expect(last.ask).toBe("What is the fix?")
    expect(last.lead).toContain("currentPos += _velocity * deltaTime;")
    expect(last.lead).not.toContain("\n\n")
  })
})

describe("promptSentences with Windows line endings", () => {
  it("collapses blank lines the same as a Unix quiz", () => {
    const windows = LONG.replace(/\n/gu, "\r\n")

    expect(promptSentences(windows)).toEqual(promptSentences(LONG))
  })
})

describe("answerFontRem", () => {
  it("uses 50, 46 and 43 px by the longest answer", () => {
    expect(answerFontRem(["short", "x".repeat(48)])).toBe(3.125)
    expect(answerFontRem(["x".repeat(49)])).toBe(2.875)
    expect(answerFontRem(["x".repeat(62)])).toBe(2.875)
    expect(answerFontRem(["x".repeat(63)])).toBe(2.6875)
    expect(answerFontRem(["x".repeat(200)])).toBe(2.6875)
  })

  it("has a size for an empty list", () => {
    expect(answerFontRem([])).toBe(3.125)
  })
})
