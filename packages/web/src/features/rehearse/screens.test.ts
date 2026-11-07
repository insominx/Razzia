import {
  boundedIndex,
  pickForQuestion,
  statusForQuestion,
} from "@razzia/web/features/rehearse/screens"
import { describe, expect, it } from "vitest"

const content = {
  subject: "Quiz",
  questions: [
    {
      question: "First?",
      answers: ["A", "B", "C"],
      solutions: [2],
      cooldown: 5,
      time: 20,
    },
    {
      question: "Second?",
      answers: ["D", "E"],
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
  ],
}

describe("boundedIndex", () => {
  it("keeps a slot inside the quiz", () => {
    expect(boundedIndex(-3, 2)).toBe(0)
    expect(boundedIndex(1.7, 2)).toBe(1)
    expect(boundedIndex(9, 2)).toBe(1)
    expect(boundedIndex(0, 0)).toBe(0)
  })
})

describe("statusForQuestion", () => {
  it("builds the screen from the question it is given", () => {
    const status = statusForQuestion("answers", content, 1)

    expect(status.name).toBe("SELECT_ANSWER")
    expect(status.data).toMatchObject({
      questionNumber: 2,
      question: "Second?",
      answers: ["D", "E"],
    })
  })

  it("reads past the end as the last question", () => {
    expect(statusForQuestion("question", content, 40).data).toMatchObject({
      questionNumber: 2,
    })
  })

  it("stages a live reveal from now", () => {
    const before = Date.now()
    const status = statusForQuestion("reveal", content, 0)

    expect(status.data).toMatchObject({ solutions: [2] })
    expect(
      (status.data as { resultsAt: number }).resultsAt,
    ).toBeGreaterThanOrEqual(before)
  })
})

describe("pickForQuestion", () => {
  it("holds the right answer for the locked-in screen", () => {
    expect(pickForQuestion("wait", content, 0)).toEqual({
      questionNumber: 1,
      key: 2,
      text: "C",
    })
  })

  it("picks nothing on any other screen, or from a quiz with no questions", () => {
    expect(pickForQuestion("answers", content, 0)).toBeNull()
    expect(
      pickForQuestion("wait", { subject: "", questions: [] }, 0),
    ).toBeNull()
  })
})
