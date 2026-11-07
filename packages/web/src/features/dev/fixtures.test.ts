import { STATUS } from "@razzia/common/types/game/status"
import { getVisibleAnswerCount } from "@razzia/common/utils/answer-reveal"
import {
  getVisibleSentenceCount,
  splitQuestionSentences,
} from "@razzia/common/utils/question-transition"
import {
  allQuestions,
  crowdResponses,
  FIXTURES,
  QUIZ_LOAD_ERRORS,
  QUIZZES,
  statusFor,
} from "@razzia/web/features/dev/fixtures"
import { describe, expect, it } from "vitest"

describe("real quizzes", () => {
  it("loads every quiz under config/quizz through the app validator", () => {
    expect(QUIZ_LOAD_ERRORS).toEqual([])
    expect(QUIZZES.length).toBeGreaterThan(0)
    expect(allQuestions().length).toBeGreaterThan(0)
  })

  it("normalizes solutions to arrays that point at real answers", () => {
    for (const { quizId, index, question } of allQuestions()) {
      expect(Array.isArray(question.solutions), `${quizId} #${index + 1}`).toBe(
        true,
      )
      for (const solution of question.solutions) {
        expect(solution).toBeLessThan(question.answers.length)
      }
    }
  })
})

describe("statusFor", () => {
  const quizId = QUIZZES[0].id

  it("names the right game status for every fixture", () => {
    const expected: Record<string, string> = {
      room: STATUS.SHOW_ROOM,
      start: STATUS.SHOW_START,
      prepared: STATUS.SHOW_PREPARED,
      question: STATUS.SHOW_QUESTION,
      answers: STATUS.SELECT_ANSWER,
      result: STATUS.SHOW_RESULT,
      verdict: STATUS.SHOW_RESULT,
      "verdict-wrong": STATUS.SHOW_RESULT,
      "verdict-none": STATUS.SHOW_RESULT,
      responses: STATUS.SHOW_RESPONSES,
      "responses-wrong": STATUS.SHOW_RESPONSES,
      reveal: STATUS.SHOW_RESPONSES,
      "reveal-wrong": STATUS.SHOW_RESPONSES,
      leaderboard: STATUS.SHOW_LEADERBOARD,
      standing: STATUS.SHOW_STANDING,
      "standing-lead": STATUS.SHOW_STANDING,
      podium: STATUS.FINISHED,
      finished: STATUS.FINISHED,
      "finished-mid": STATUS.FINISHED,
      wait: STATUS.WAIT,
      "wait-lobby": STATUS.WAIT,
    }

    for (const { id } of FIXTURES) {
      expect(statusFor({ fixture: id, quizId, question: 0 }).name).toBe(
        expected[id],
      )
    }
  })

  it("builds every fixture from every real question without throwing", () => {
    for (const { quizId: id, index } of allQuestions()) {
      for (const { id: fixture } of FIXTURES) {
        expect(() =>
          statusFor({ fixture, quizId: id, question: index }),
        ).not.toThrow()
      }
    }
  })

  it("settles the results unless the fixture is a live reveal", () => {
    const stamps = (fixture: "responses" | "reveal") => {
      const status = statusFor({ fixture, quizId, question: 0 })

      if (status.name !== STATUS.SHOW_RESPONSES) {
        throw new Error("unexpected status")
      }

      return status.data
    }

    // Settled: no stamps, so no flood and nothing to replay (what a reconnect,
    // a lecture review, and the fit report all see).
    expect(stamps("responses").resultsAt).toBeUndefined()
    // Live: stamped now, so the verdict stages from the moment it is chosen.
    expect(stamps("reveal").resultsAt).toBeDefined()
    expect(stamps("reveal").resultsAt).toBe(stamps("reveal").serverNow)
  })

  it("clamps an out-of-range question to the quiz", () => {
    const last = QUIZZES[0].quiz.questions.length

    const status = statusFor({ fixture: "prepared", quizId, question: 9_999 })

    expect(status.name).toBe(STATUS.SHOW_PREPARED)
    expect(status.data).toMatchObject({ questionNumber: last })
  })

  it("settles the question: every sentence is read", () => {
    for (const { quizId: id, index } of allQuestions()) {
      const status = statusFor({
        fixture: "question",
        quizId: id,
        question: index,
      })

      if (status.name !== STATUS.SHOW_QUESTION) {
        throw new Error("unexpected status")
      }

      const { question, serverNow, promptStartedAt } = status.data

      expect(
        getVisibleSentenceCount(question, serverNow - promptStartedAt),
      ).toBe(splitQuestionSentences(question).length)
    }
  })

  it("settles the answers: all revealed and answering open", () => {
    for (const { quizId: id, index } of allQuestions()) {
      const status = statusFor({
        fixture: "answers",
        quizId: id,
        question: index,
      })

      if (status.name !== STATUS.SELECT_ANSWER) {
        throw new Error("unexpected status")
      }

      const { answers, serverNow, revealStartedAt, answeringOpen } = status.data

      expect(answeringOpen).toBe(true)
      expect(
        getVisibleAnswerCount(answers.length, serverNow - revealStartedAt),
      ).toBe(answers.length)
    }
  })
})

describe("crowdResponses", () => {
  const four = { answers: ["a", "b", "c", "d"], solutions: [2] }

  it("puts the room on the right answer", () => {
    expect(crowdResponses(four, "right")).toEqual({ 0: 3, 1: 2, 2: 12, 3: 1 })
  })

  it("puts the room on a wrong answer with the right one far behind", () => {
    const responses = crowdResponses(four, "wrong")
    const [top] = Object.entries(responses).sort((a, b) => b[1] - a[1])

    expect(top[0]).toBe("0")
    expect(responses[2]).toBe(3)
  })

  it("handles two answers and several right answers", () => {
    expect(
      crowdResponses({ answers: ["a", "b"], solutions: [1] }, "right"),
    ).toEqual({ 0: 3, 1: 12 })
    expect(
      crowdResponses({ answers: ["a", "b", "c"], solutions: [0, 2] }, "right"),
    ).toEqual({ 0: 12, 1: 3, 2: 12 })
  })
})
