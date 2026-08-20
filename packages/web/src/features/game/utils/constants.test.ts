import { describe, expect, it } from "vitest"
import { answersMusicForTheme } from "@razzia/web/features/game/utils/constants"

describe("answersMusicForTheme", () => {
  it("maps undefined, default, and classic to the classic path", () => {
    expect(answersMusicForTheme()).toBe("/sounds/answersMusic.mp3")
    expect(answersMusicForTheme(undefined)).toBe("/sounds/answersMusic.mp3")
    expect(answersMusicForTheme("classic")).toBe("/sounds/answersMusic.mp3")
  })

  it("maps techno to the techno path", () => {
    expect(answersMusicForTheme("techno")).toBe(
      "/sounds/themes/techno/answersMusic.mp3",
    )
  })
})
