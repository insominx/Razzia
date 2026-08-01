import { describe, expect, it } from "vitest"
import {
  ANSWER_BADGE_COLORS,
  ANSWERS_COLORS,
} from "@razzia/web/features/game/utils/constants"

describe("answer identity recipes", () => {
  it("gives deck bodies accent mass and on-answer text for stage readability", () => {
    expect(ANSWERS_COLORS).toEqual([
      "border-answer-a-border bg-answer-a text-on-answer",
      "border-answer-b-border bg-answer-b text-on-answer",
      "border-answer-c-border bg-answer-c text-on-answer",
      "border-answer-d-border bg-answer-d text-on-answer",
    ])
  })

  it("matches the gallery badge recipe: accent fill + on-answer", () => {
    expect(ANSWER_BADGE_COLORS).toEqual([
      "border-answer-a-border bg-answer-a text-on-answer",
      "border-answer-b-border bg-answer-b text-on-answer",
      "border-answer-c-border bg-answer-c text-on-answer",
      "border-answer-d-border bg-answer-d text-on-answer",
    ])
  })
})
