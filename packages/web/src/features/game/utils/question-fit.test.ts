import { QUIZZES } from "@razzia/web/features/dev/fixtures"
import {
  ANSWER_FIT_CHARS,
  questionFitProblems,
} from "@razzia/web/features/game/utils/question-fit"
import { describe, expect, it } from "vitest"

describe("questionFitProblems", () => {
  it("has nothing to say about an ordinary question", () => {
    expect(
      questionFitProblems({
        question: "Which boundary owns this state?",
        answers: ["The client", "The server"],
      }),
    ).toEqual([])
  })

  it("flags an answer too long for its tile", () => {
    expect(
      questionFitProblems({
        question: "Which one?",
        answers: ["Short", "x".repeat(ANSWER_FIT_CHARS + 1)],
      }),
    ).toEqual(["answer"])
  })

  it("accepts an answer exactly at the limit", () => {
    expect(
      questionFitProblems({
        question: "Which one?",
        answers: ["x".repeat(ANSWER_FIT_CHARS)],
      }),
    ).toEqual([])
  })

  it("flags a prompt too tall for the stage at its smallest size", () => {
    const wall = Array.from(
      { length: 40 },
      (_, line) => `Line ${line} of a pasted listing`,
    ).join("\n")

    expect(
      questionFitProblems({
        question: `${wall}\nWhat prints?`,
        answers: ["A"],
      }),
    ).toEqual(["prompt"])
  })

  it("can flag both at once", () => {
    const wall = Array.from({ length: 40 }, (_, line) => `Line ${line}`).join(
      "\n",
    )

    expect(
      questionFitProblems({
        question: `${wall}\nWhat prints?`,
        answers: ["x".repeat(ANSWER_FIT_CHARS + 5)],
      }),
    ).toEqual(["prompt", "answer"])
  })

  it("agrees with the fit report: none of the real questions is flagged", () => {
    for (const { quiz } of QUIZZES) {
      for (const question of quiz.questions) {
        expect(questionFitProblems(question)).toEqual([])
      }
    }
  })
})
