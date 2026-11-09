import { EVENTS, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { Quizz } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import { getAnswerRevealDuration } from "@razzia/common/utils/answer-reveal"
import { getQuestionPromptRevealMs } from "@razzia/common/utils/question-transition"
import {
  CROWD_ANSWERED,
  milestonesOf,
  planRound,
  type RoundMessage,
  type RoundStep,
  scheduleAfter,
} from "@razzia/web/features/dev/round"
import { describe, expect, it } from "vitest"

const QUESTION_TEXT =
  "The car is parked and still. One hub's ray hits the road. What displacement goes into the spring?"

const quiz = (overrides: Partial<Quizz["questions"][number]> = {}): Quizz => ({
  subject: "Demo",
  questions: [
    {
      question: QUESTION_TEXT,
      answers: ["zero", "minus", "plus", "hit"],
      solutions: [1],
      cooldown: 5,
      time: 20,
      ...overrides,
    },
    {
      question: "Second?",
      answers: ["a", "b"],
      solutions: [0],
      cooldown: 3,
      time: 10,
    },
  ],
})

const plan = (q = quiz(), question = 0) =>
  planRound({ quiz: q, question, crowd: "right" })

const step = (steps: RoundStep[], id: string) => {
  const found = steps.find((candidate) => candidate.id === id)

  if (!found) {
    throw new Error(`no step ${id}`)
  }

  return found
}

const statusOf = (messages: RoundMessage[], to: string) => {
  const found = messages.find(
    (message) => message.kind === "status" && message.to === to,
  )

  if (found?.kind !== "status") {
    throw new Error(`no status for ${to}`)
  }

  return found.status
}

describe("planRound timeline", () => {
  const steps = plan()

  it("follows the server's clock", () => {
    const reveal = 1_000 + getQuestionPromptRevealMs(QUESTION_TEXT) + 5 * 1_000

    expect(step(steps, "prepared").at).toBe(0)
    expect(step(steps, "question").at).toBe(1_000)
    expect(step(steps, "reveal").at).toBe(reveal)
    // Four answers: the plan's 1, 4, 7, 10 s slots and the fade, 12 s in all.
    expect(step(steps, "open").at - reveal).toBe(12_000)
    expect(step(steps, "open").at - reveal).toBe(getAnswerRevealDuration(4))
    expect(step(steps, "results").at - step(steps, "open").at).toBe(20_000)
  })

  it("is in order, with the milestones the Director jumps to", () => {
    expect(steps.map((s) => s.at)).toEqual(
      [...steps.map((s) => s.at)].sort((a, b) => a - b),
    )
    expect(milestonesOf(steps).map((s) => s.id)).toEqual([
      "prepared",
      "question",
      "reveal",
      "open",
      "results",
      "leaderboard",
    ])
  })

  it("ticks the countdown like the server: time - 1 down to 1", () => {
    const ticks = steps.filter((s) => s.id.startsWith("tick-"))
    const values = ticks.map((s) => {
      const [message] = s.messages({ start: 0, now: 0, choice: null })

      return message.kind === "event" ? message.args[0] : null
    })

    expect(ticks).toHaveLength(19)
    expect(values[0]).toBe(19)
    expect(values.at(-1)).toBe(1)
    expect(ticks[0].at - step(steps, "open").at).toBe(1_000)
    expect(
      step(steps, "tick-1").messages({ start: 0, now: 0, choice: null })[0],
    ).toMatchObject({ event: EVENTS.GAME.COOLDOWN })
  })

  it("answers arrive one by one while the window is open", () => {
    const answers = steps.filter((s) => s.id.startsWith("answer-"))
    const open = step(steps, "open").at
    const results = step(steps, "results").at

    expect(answers).toHaveLength(CROWD_ANSWERED)
    expect(answers[0].at).toBeGreaterThan(open)
    expect(answers.at(-1)?.at).toBeLessThan(results)
  })

  it("stops the crowd answering when a short window closes", () => {
    // The real quizzes include a 3 s window.
    const short = plan(quiz({ time: 3 }))
    const answers = short.filter((s) => s.id.startsWith("answer-"))

    expect(answers.length).toBeGreaterThan(0)
    expect(answers.length).toBeLessThan(CROWD_ANSWERED)
    expect(Math.max(...answers.map((s) => s.at))).toBeLessThan(
      step(short, "results").at,
    )
    expect(short.filter((s) => s.id.startsWith("tick-"))).toHaveLength(2)
  })

  it("leaves the leaderboard to the host", () => {
    expect(step(steps, "leaderboard").manual).toBe(true)
    expect(steps.filter((s) => s.manual).map((s) => s.id)).toEqual([
      "leaderboard",
    ])
  })

  it("scales the reveal to two answers", () => {
    const two = plan(quiz({ answers: ["a", "b"], solutions: [0] }))

    expect(step(two, "open").at - step(two, "reveal").at).toBe(
      getAnswerRevealDuration(2),
    )
  })

  it("has no ticks and waits for the host when the question is untimed", () => {
    const untimed = plan(quiz({ time: NO_TIME_LIMIT }))

    expect(untimed.some((s) => s.id.startsWith("tick-"))).toBe(false)
    expect(step(untimed, "results").manual).toBe(true)
  })
})

describe("planRound messages", () => {
  const steps = plan()
  const start = 1_000_000

  it("stamps the unlock exactly when the reveal said it would", () => {
    const revealAt = step(steps, "reveal").at
    const openAt = step(steps, "open").at
    const reveal = statusOf(
      step(steps, "reveal").messages({
        start,
        now: start + revealAt,
        choice: null,
      }),
      "both",
    )
    const open = statusOf(
      step(steps, "open").messages({
        start,
        now: start + openAt,
        choice: null,
      }),
      "both",
    )

    if (
      reveal.name !== STATUS.SELECT_ANSWER ||
      open.name !== STATUS.SELECT_ANSWER
    ) {
      throw new Error("expected SELECT_ANSWER")
    }

    expect(reveal.data.answeringOpen).toBe(false)
    expect(open.data.answeringOpen).toBe(true)
    expect(open.data.revealStartedAt).toBe(reveal.data.revealStartedAt)
    expect(open.data.unlockAt).toBe(start + openAt)
    expect(open.data.serverNow).toBe(open.data.unlockAt)
  })

  it("lands a jumped-to step in its own moment", () => {
    // Jumping to "open" puts t=0 twelve seconds + before now.
    const openAt = step(steps, "open").at
    const now = 5_000_000
    const open = statusOf(
      step(steps, "open").messages({ start: now - openAt, now, choice: null }),
      "both",
    )

    if (open.name !== STATUS.SELECT_ANSWER) {
      throw new Error("expected SELECT_ANSWER")
    }

    expect(now - open.data.revealStartedAt).toBe(12_000)
  })

  it("gives the phone a verdict for its own tap, and the host the chart", () => {
    const results = step(steps, "results")
    const verdict = (choice: number | null) => {
      const status = statusOf(
        results.messages({ start, now: start, choice }),
        "phone",
      )

      if (status.name !== STATUS.SHOW_RESULT) {
        throw new Error("expected SHOW_RESULT")
      }

      return status.data
    }

    expect(verdict(1)).toMatchObject({
      correct: true,
      message: "game:correct",
      points: 840,
    })
    expect(verdict(2)).toMatchObject({
      correct: false,
      message: "game:wrong",
      points: 0,
    })
    expect(verdict(null)).toMatchObject({
      correct: false,
      message: "game:wrong",
    })

    const host = statusOf(
      results.messages({ start, now: start, choice: 1 }),
      "host",
    )

    expect(host.name).toBe(STATUS.SHOW_RESPONSES)
  })

  it("sends the crowd mode into the host chart", () => {
    const wrong = planRound({ quiz: quiz(), question: 0, crowd: "wrong" })
    const status = statusOf(
      step(wrong, "results").messages({ start, now: start, choice: null }),
      "host",
    )

    if (status.name !== STATUS.SHOW_RESPONSES) {
      throw new Error("expected SHOW_RESPONSES")
    }

    expect(status.data.responses[1]).toBe(3)
    expect(status.data.responses[0]).toBe(8)
  })

  it("keeps the leaderboard off the phone", () => {
    const messages = step(steps, "leaderboard").messages({
      start,
      now: start,
      choice: null,
    })

    expect(messages.map((message) => message.to)).toEqual(["host"])
  })
})

describe("scheduleAfter", () => {
  const steps = plan()

  it("schedules everything automatic after the start, relative to it", () => {
    const schedule = scheduleAfter(steps, 0)

    expect(schedule[0].step.id).toBe("question")
    expect(schedule[0].delayMs).toBe(1_000)
    expect(schedule.some(({ step: s }) => s.manual)).toBe(false)
    expect(schedule.at(-1)?.step.id).toBe("results")
  })

  it("schedules only what comes after a jump, and not the landing itself", () => {
    const from = steps.findIndex((s) => s.id === "open")
    const schedule = scheduleAfter(steps, from)

    expect(schedule.map(({ step: s }) => s.id)).not.toContain("open")
    expect(schedule[0].delayMs).toBeGreaterThan(0)
    expect(schedule.every(({ step: s }) => s.at > step(steps, "open").at)).toBe(
      true,
    )
  })

  it("lands the verdict exactly one answering window after the unlock", () => {
    const from = steps.findIndex((s) => s.id === "open")
    const results = scheduleAfter(steps, from).find(
      ({ step: s }) => s.id === "results",
    )

    expect(results?.delayMs).toBe(20_000)
  })
})
