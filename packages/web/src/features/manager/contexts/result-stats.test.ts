import type { QuestionResult } from "@razzia/common/types/game"
import {
  buildPointsByName,
  computeQuestionStats,
} from "@razzia/web/features/manager/contexts/result-stats"
import { describe, expect, it } from "vitest"

const question = (
  answerIds: Array<number | null>,
  solutions = [0],
): Pick<QuestionResult, "answers" | "solutions" | "playerAnswers"> => ({
  answers: ["A", "B", "C", "D"],
  solutions,
  playerAnswers: answerIds.map((answerId, i) => ({
    playerName: `p${i}`,
    answerId,
  })),
})

describe("computeQuestionStats", () => {
  it("uses the recorded answers as the one denominator", () => {
    const stats = computeQuestionStats(question([0, 0, 1, null]))

    expect(stats.participantCount).toBe(4)
    expect(stats.answeredCount).toBe(3)
    expect(stats.noAnswerCount).toBe(1)
    expect(stats.correctCount).toBe(2)
    expect(stats.correctPct).toBe(50)
    expect(stats.answerCounts).toEqual([2, 1, 0, 0])
    expect(stats.maxAnswerCount).toBe(2)
  })

  it("never goes past 100 percent when more answers than players exist", () => {
    // Ten recorded answers, all right, while the final standings list fewer.
    const stats = computeQuestionStats(
      question(Array.from({ length: 10 }, () => 0)),
    )

    expect(stats.participantCount).toBe(10)
    expect(stats.correctPct).toBe(100)
    expect(stats.noAnswerCount).toBe(0)
    expect(stats.answeredCount).toBe(10)
  })

  it("does not count players that have no entry as unanswered", () => {
    const stats = computeQuestionStats(question([1, null]))

    expect(stats.participantCount).toBe(2)
    expect(stats.noAnswerCount).toBe(1)
    expect(stats.correctPct).toBe(0)
  })

  it("guards a question nobody was recorded for", () => {
    const stats = computeQuestionStats(question([]))

    expect(stats.participantCount).toBe(0)
    expect(stats.correctPct).toBe(0)
    expect(stats.answeredCount).toBe(0)
    expect(stats.noAnswerCount).toBe(0)
    expect(stats.maxAnswerCount).toBe(1)
  })

  it("counts only null as no answer", () => {
    const stats = computeQuestionStats(question([null, null, null]))

    expect(stats.noAnswerCount).toBe(3)
    expect(stats.answeredCount).toBe(0)
    expect(stats.correctCount).toBe(0)
  })

  it("handles a question with no answers at all", () => {
    const stats = computeQuestionStats({
      answers: [],
      solutions: [],
      playerAnswers: [],
    })

    expect(stats.answerCounts).toEqual([])
    expect(stats.maxAnswerCount).toBe(1)
  })
})

describe("buildPointsByName", () => {
  it("keeps the first entry for a repeated name", () => {
    const points = buildPointsByName([
      { username: "Ann", points: 900, rank: 1 },
      { username: "Ann", points: 100, rank: 2 },
      { username: "Bob", points: 0, rank: 3 },
    ])

    expect(points.get("Ann")).toBe(900)
    expect(points.get("Bob")).toBe(0)
    expect(points.has("Zed")).toBe(false)
  })
})
