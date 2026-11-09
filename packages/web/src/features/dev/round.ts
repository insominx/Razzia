import { EVENTS, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { Quizz } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import { getAnswerRevealDuration } from "@razzia/common/utils/answer-reveal"
import {
  getQuestionPromptRevealMs,
  QUESTION_NUMBER_INTRO_MS,
} from "@razzia/common/utils/question-transition"
import {
  answerStatusData,
  CROWD_SIZE,
  type CrowdMode,
  crowdResponses,
  type GameStatus,
  leaderboardStatusData,
  PHONE_PLAYER,
  responsesStatusData,
} from "@razzia/web/features/dev/fixtures"

/**
 * One question's round as the server plays it, timed from the same constants
 * (`round-manager.ts`): the number card, the prompt and its cooldown, the
 * answer reveal, the answering window with its per-second COOLDOWN ticks, then
 * the verdict. The leaderboard waits for the host, as it does live.
 */

export type RoundTarget = "host" | "phone" | "both"

export type RoundMessage =
  | { to: RoundTarget; kind: "status"; status: GameStatus }
  | { to: RoundTarget; kind: "event"; event: string; args: unknown[] }

export interface RoundContext {
  /** Epoch ms of the round's t=0, or where it would be had it run unjumped. */
  start: number
  /** Epoch ms of delivery. */
  now: number
  /** The answer the phone player tapped, if any. */
  choice: number | null
}

export type RoundStepId =
  | "prepared"
  | "question"
  | "reveal"
  | "open"
  | "results"
  | "leaderboard"
  | `answer-${number}`
  | `tick-${number}`

export interface RoundStep {
  id: RoundStepId
  label: string
  /** Milliseconds from the round's t=0. */
  at: number
  /** A jump target in the UI; the crowd's answers and ticks are not. */
  milestone: boolean
  /** Never fires on its own: the host presses Next. */
  manual: boolean
  messages: (context: RoundContext) => RoundMessage[]
}

export interface RoundInput {
  quiz: Quizz
  /** 0-based. */
  question: number
  crowd: CrowdMode
}

/** How many of the room answer, and how soon after answers open. */
export const CROWD_ANSWERED = 14

const FIRST_ANSWER_MS = 1_500
const ANSWER_SPACING_MS = 700
const CROWD_CUTOFF_MS = 500
const NOMINAL_UNTIMED_MS = 20_000
const LEADERBOARD_AFTER_MS = 1_000

const CORRECT_POINTS = 840

const phoneVerdict = (
  correct: boolean,
  solutionsCount: number,
  now: number,
): GameStatus => ({
  name: STATUS.SHOW_RESULT,
  data: {
    resultsAt: now,
    serverNow: now,
    correct,
    message: correct ? "game:correct" : "game:wrong",
    points: correct ? CORRECT_POINTS : 0,
    myPoints: PHONE_PLAYER.points + (correct ? CORRECT_POINTS : 0),
    rank: correct ? 1 : Math.max(2, solutionsCount + 1),
    aheadOfMe: correct ? null : "Grace",
  },
})

export const planRound = ({
  quiz,
  question: index,
  crowd,
}: RoundInput): RoundStep[] => {
  const at = Math.min(Math.max(0, Math.floor(index)), quiz.questions.length - 1)
  const question = quiz.questions[at]
  const number = at + 1
  const timed = question.time !== NO_TIME_LIMIT

  const questionAt = QUESTION_NUMBER_INTRO_MS
  const revealAt =
    questionAt +
    getQuestionPromptRevealMs(question.question) +
    question.cooldown * 1_000
  const openAt = revealAt + getAnswerRevealDuration(question.answers.length)
  const resultsAt =
    openAt + (timed ? question.time * 1_000 : NOMINAL_UNTIMED_MS)

  // Stamps come from the plan, not from when a timer happened to fire, so the
  // reveal and the unlock agree to the millisecond and a jump needs no replay.
  const stamp = (context: RoundContext, offset: number) =>
    context.start + offset

  const steps: RoundStep[] = [
    {
      id: "prepared",
      label: "Number card",
      at: 0,
      milestone: true,
      manual: false,
      messages: () => [
        {
          to: "both",
          kind: "event",
          event: EVENTS.GAME.UPDATE_QUESTION,
          args: [{ current: number, total: quiz.questions.length }],
        },
        {
          to: "both",
          kind: "status",
          status: {
            name: STATUS.SHOW_PREPARED,
            data: {
              totalAnswers: question.answers.length,
              questionNumber: number,
            },
          },
        },
      ],
    },
    {
      id: "question",
      label: "Question",
      at: questionAt,
      milestone: true,
      manual: false,
      messages: (context) => [
        {
          to: "both",
          kind: "status",
          status: {
            name: STATUS.SHOW_QUESTION,
            data: {
              questionNumber: number,
              question: question.question,
              media: question.media,
              cooldown: question.cooldown,
              answerCount: question.answers.length,
              promptStartedAt: stamp(context, questionAt),
              serverNow: context.now,
            },
          },
        },
      ],
    },
    {
      id: "reveal",
      label: "Answers revealing",
      at: revealAt,
      milestone: true,
      manual: false,
      messages: (context) => [
        {
          to: "both",
          kind: "status",
          status: {
            name: STATUS.SELECT_ANSWER,
            data: answerStatusData(question, number, {
              revealStartedAt: stamp(context, revealAt),
              serverNow: context.now,
              answeringOpen: false,
            }),
          },
        },
      ],
    },
    {
      id: "open",
      label: "Answers open",
      at: openAt,
      milestone: true,
      manual: false,
      messages: (context) => [
        {
          to: "both",
          kind: "status",
          status: {
            name: STATUS.SELECT_ANSWER,
            data: answerStatusData(question, number, {
              revealStartedAt: stamp(context, revealAt),
              serverNow: context.now,
              answeringOpen: true,
            }),
          },
        },
      ],
    },
  ]

  // The room answers at its own pace, but only while the window is open: a
  // short question simply collects fewer of them.
  for (let count = 1; count <= CROWD_ANSWERED; count += 1) {
    const answerAt = openAt + FIRST_ANSWER_MS + (count - 1) * ANSWER_SPACING_MS

    if (answerAt >= resultsAt - CROWD_CUTOFF_MS) {
      break
    }

    steps.push({
      id: `answer-${count}`,
      label: `${count} of ${CROWD_SIZE} answered`,
      at: answerAt,
      milestone: false,
      manual: false,
      messages: () => [
        {
          to: "both",
          kind: "event",
          event: EVENTS.GAME.PLAYER_ANSWER,
          args: [count],
        },
      ],
    })
  }

  // The server emits `time - 1` down to 1, one a second; the last second ends
  // the window instead of ticking.
  const ticks = timed ? question.time - 1 : 0

  for (let tick = 1; tick <= ticks; tick += 1) {
    steps.push({
      id: `tick-${tick}`,
      label: `${question.time - tick} s left`,
      at: openAt + tick * 1_000,
      milestone: false,
      manual: false,
      messages: () => [
        {
          to: "both",
          kind: "event",
          event: EVENTS.GAME.COOLDOWN,
          args: [question.time - tick],
        },
      ],
    })
  }

  steps.push(
    {
      id: "results",
      label: "Results",
      at: resultsAt,
      milestone: true,
      manual: !timed,
      messages: (context) => [
        {
          to: "phone",
          kind: "status",
          status: phoneVerdict(
            context.choice !== null &&
              question.solutions.includes(context.choice),
            question.solutions.length,
            context.now,
          ),
        },
        {
          to: "host",
          kind: "status",
          status: {
            name: STATUS.SHOW_RESPONSES,
            data: responsesStatusData(question, number, {
              responses: crowdResponses(question, crowd),
              // The verdict is staged from the moment answering ended.
              stamps: { resultsAt: context.now, serverNow: context.now },
            }),
          },
        },
      ],
    },
    {
      id: "leaderboard",
      label: "Leaderboard",
      at: resultsAt + LEADERBOARD_AFTER_MS,
      milestone: true,
      manual: true,
      messages: () => [
        {
          to: "host",
          kind: "status",
          status: {
            name: STATUS.SHOW_LEADERBOARD,
            data: leaderboardStatusData(),
          },
        },
      ],
    },
  )

  return steps.sort((a, b) => a.at - b.at)
}

/**
 * The steps that fire on their own after step `from`, each with its delay from
 * that step. `from` itself is delivered by the caller, so a jump lands at once.
 */
export const scheduleAfter = (
  steps: readonly RoundStep[],
  from: number,
): Array<{ step: RoundStep; delayMs: number }> =>
  steps
    .filter((step, index) => index > from && !step.manual)
    .map((step) => ({ step, delayMs: Math.max(0, step.at - steps[from].at) }))

export const milestonesOf = (steps: readonly RoundStep[]): RoundStep[] =>
  steps.filter((step) => step.milestone)
