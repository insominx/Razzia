import {
  QUESTION_CONTENT_ENTER_MS,
  QUESTION_NUMBER_FADE_MS,
  QUESTION_NUMBER_INTRO_MS,
} from "@razzia/common/utils/question-transition"
import { describe, expect, it } from "vitest"

describe("question transition timing", () => {
  it("locks the number intro and question entrance beats", () => {
    expect(QUESTION_NUMBER_INTRO_MS).toBe(1_000)
    expect(QUESTION_NUMBER_FADE_MS).toBe(500)
    expect(QUESTION_CONTENT_ENTER_MS).toBe(950)
  })

  it("finishes the number fade before the intro status advances", () => {
    expect(QUESTION_NUMBER_FADE_MS).toBeLessThanOrEqual(
      QUESTION_NUMBER_INTRO_MS,
    )
  })
})
