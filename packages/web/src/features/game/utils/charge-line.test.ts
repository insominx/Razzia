import { getAnswerRevealDuration } from "@razzia/common/utils/answer-reveal"
import {
  cooldownShare,
  heatDelayMs,
  questionSegment,
  revealSegment,
} from "@razzia/web/features/game/utils/charge-line"
import { describe, expect, it } from "vitest"

describe("charge line", () => {
  it("splits the growth between the cooldown and the reveal", () => {
    // 5 s of cooldown, then the 12 s reveal of four answers.
    expect(cooldownShare(5, 4)).toBeCloseTo(5 / 17, 10)
  })

  it("is continuous across the two screens: one ends where the other starts", () => {
    for (const [cooldown, answers] of [
      [5, 4],
      [3, 4],
      [5, 2],
      [3, 3],
    ] as const) {
      const question = questionSegment(cooldown, answers)
      const reveal = revealSegment(cooldown, answers)

      expect(question.from).toBe(0)
      expect(question.to).toBeCloseTo(reveal.from, 10)
      expect(reveal.to).toBe(1)
    }
  })

  it("grows at one speed throughout, so the join is not a change of pace", () => {
    const question = questionSegment(5, 4)
    const reveal = revealSegment(5, 4)

    expect((question.to - question.from) / question.durationMs).toBeCloseTo(
      (reveal.to - reveal.from) / reveal.durationMs,
      10,
    )
  })

  it("takes the real durations: the cooldown, and the server's reveal", () => {
    expect(questionSegment(5, 4).durationMs).toBe(5_000)
    expect(revealSegment(5, 4).durationMs).toBe(getAnswerRevealDuration(4))
    expect(revealSegment(5, 2).durationMs).toBe(getAnswerRevealDuration(2))
  })

  it("reads a payload that predates the new fields as 5 s and four answers", () => {
    expect(questionSegment()).toEqual(questionSegment(5, 4))
    expect(revealSegment()).toEqual(revealSegment(5, 4))
  })

  it("turns the line hot for the last five seconds of the answering window", () => {
    expect(heatDelayMs(20)).toBe(15_000)
    expect(heatDelayMs(10)).toBe(5_000)
    expect(heatDelayMs(3)).toBe(0)
  })
})
