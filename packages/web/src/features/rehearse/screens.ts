import type { PublicPlayer, Question } from "@razzia/common/types/game"
import { STATUS, type StatusDataMap } from "@razzia/common/types/game/status"
import { getAnswerRevealDuration } from "@razzia/common/utils/answer-reveal"
import { getQuestionPromptRevealMs } from "@razzia/common/utils/question-transition"
import type { Status } from "@razzia/web/features/game/utils/createStatus"

// The screens of a game, built from one question: what the Director shows from
// the real quizzes and what the editor's rehearsal shows from a draft. Nothing
// here knows where a question came from.

/** Which side of the game a screen belongs to. */
export type ScreenView = "host" | "phone"

/** Every screen the Director can show, each with the surfaces it exists on. */
export const FIXTURES = [
  { id: "room", label: "Room", views: ["host"] },
  { id: "room-30", label: "Room · 30 players", views: ["host"] },
  { id: "room-60", label: "Room · 60 players", views: ["host"] },
  { id: "start", label: "Start", views: ["host", "phone"] },
  { id: "prepared", label: "Prepared", views: ["host", "phone"] },
  { id: "question", label: "Question", views: ["host", "phone"] },
  { id: "answers", label: "Answers", views: ["host", "phone"] },
  { id: "result", label: "Result", views: ["phone"] },
  { id: "verdict", label: "Verdict · right (live)", views: ["phone"] },
  { id: "verdict-wrong", label: "Verdict · wrong (live)", views: ["phone"] },
  { id: "verdict-none", label: "Verdict · no answer (live)", views: ["phone"] },
  { id: "responses", label: "Responses", views: ["host"] },
  { id: "responses-wrong", label: "Responses · crowd wrong", views: ["host"] },
  { id: "reveal", label: "Reveal · crowd right (live)", views: ["host"] },
  { id: "reveal-wrong", label: "Reveal · crowd wrong (live)", views: ["host"] },
  { id: "leaderboard", label: "Leaderboard", views: ["host"] },
  { id: "standing", label: "Standing · climbing", views: ["phone"] },
  { id: "standing-lead", label: "Standing · leading", views: ["phone"] },
  { id: "podium", label: "Podium", views: ["host"] },
  { id: "finished", label: "Finished · gold", views: ["phone"] },
  { id: "finished-mid", label: "Finished · mid-table", views: ["phone"] },
  { id: "wait", label: "Wait · locked in", views: ["phone"] },
  { id: "wait-lobby", label: "Wait · plain", views: ["phone"] },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  views: readonly ScreenView[]
}>

export type FixtureId = (typeof FIXTURES)[number]["id"]

export const isFixtureId = (value: string): value is FixtureId =>
  FIXTURES.some((fixture) => fixture.id === value)

export type GameStatus = Status<StatusDataMap>

export const CROWD_SIZE = 18

export const PLAYERS: PublicPlayer[] = [
  { id: "dev-ada", connected: true, username: "Ada", points: 9_640, streak: 4 },
  {
    id: "dev-grace",
    connected: true,
    username: "Grace",
    points: 8_920,
    streak: 2,
  },
  {
    id: "dev-linus",
    connected: true,
    username: "Linus",
    points: 7_880,
    streak: 1,
  },
]

/** A full lobby for the Director: `count` players, one with a very long name. */
export const crowd = (count: number): PublicPlayer[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `dev-crowd-${index}`,
    connected: true,
    username:
      index === 11
        ? "Bartholomew-Alexander"
        : `Player${String(index + 1).padStart(2, "0")}`,
    points: 0,
    streak: 0,
  }))

const CROWDS: Partial<Record<FixtureId, number>> = {
  "room-30": 30,
  "room-60": 60,
}

/** Who is in the room for a fixture: three players, or a crowd. */
export const playersFor = (fixture: FixtureId): PublicPlayer[] => {
  const count = CROWDS[fixture]

  return count === undefined ? [...PLAYERS] : crowd(count)
}

/** The seat the phone frame plays as. */
export const PHONE_PLAYER = { username: "Ada", points: 9_640 }

export type CrowdMode = "right" | "wrong"

/**
 * A deterministic crowd. "right" puts the room on a correct answer; "wrong"
 * puts the most-picked answer on a wrong one with the right answer a distant
 * second: the case the plan's reveal is built around.
 */
const CROWD_COUNTS = {
  right: { solution: 12, others: [3, 2, 1] },
  wrong: { solution: 3, others: [8, 4, 3] },
} as const

export const crowdResponses = (
  question: Pick<Question, "answers" | "solutions">,
  mode: CrowdMode,
): Record<number, number> => {
  const { solution, others } = CROWD_COUNTS[mode]
  const responses: Record<number, number> = {}
  let next = 0

  question.answers.forEach((_, index) => {
    if (question.solutions.includes(index)) {
      responses[index] = solution
    } else {
      responses[index] = others[next] ?? 0
      next += 1
    }
  })

  return responses
}

/** Fields shared by the reveal screens, so a fixture and a live round agree. */
export const answerStatusData = (
  question: Question,
  number: number,
  stamps: {
    revealStartedAt: number
    serverNow: number
    answeringOpen: boolean
  },
): StatusDataMap["SELECT_ANSWER"] => ({
  questionNumber: number,
  question: question.question,
  answers: question.answers,
  media: question.media,
  time: question.time,
  cooldown: question.cooldown,
  totalPlayer: CROWD_SIZE,
  unlockAt:
    stamps.revealStartedAt + getAnswerRevealDuration(question.answers.length),
  ...stamps,
})

interface ResponsesInput {
  responses: Record<number, number>
  stamps?: { resultsAt: number; serverNow: number }
}

/**
 * The results. With stamps the verdict is staged from that moment (TIME, the
 * count, the question, the strike); without them it is the settled grid, which
 * is what a reconnect or a lecture review shows and what the fit report
 * measures.
 */
export const responsesStatusData = (
  question: Question,
  number: number,
  { responses, stamps }: ResponsesInput,
): StatusDataMap["SHOW_RESPONSES"] => ({
  questionNumber: number,
  question: question.question,
  media: question.media,
  answers: question.answers,
  solutions: question.solutions,
  responses,
  totalPlayers: CROWD_SIZE,
  fastest: { username: PHONE_PLAYER.username, seconds: 2.2 },
  ...stamps,
})

/** Five players and one overtake: Grace passes Ada, Jean passes Margaret. */
export const leaderboardStatusData = (): StatusDataMap["SHOW_LEADERBOARD"] => {
  const player = (
    username: string,
    points: number,
    streak: number,
  ): PublicPlayer => ({
    id: `dev-${username.toLowerCase()}`,
    connected: true,
    username,
    points,
    streak,
  })

  return {
    oldLeaderboard: [
      player("Ada", 9_300, 3),
      player("Grace", 8_800, 4),
      player("Linus", 7_160, 1),
      player("Margaret", 6_900, 0),
      player("Jean", 6_100, 0),
    ],
    leaderboard: [
      player("Grace", 9_780, 5),
      player("Ada", 9_640, 4),
      player("Linus", 7_880, 2),
      player("Jean", 7_090, 1),
      player("Margaret", 7_000, 0),
    ],
  }
}

const responsesStatus = (
  question: Question,
  number: number,
  { mode, live = false }: { mode: CrowdMode; live?: boolean },
): GameStatus => ({
  name: STATUS.SHOW_RESPONSES,
  data: responsesStatusData(question, number, {
    responses: crowdResponses(question, mode),
    // A live fixture starts its staged verdict the moment it is chosen.
    stamps: live ? { resultsAt: Date.now(), serverNow: Date.now() } : undefined,
  }),
})

/** The podium has no rank of its own; a phone is told where it finished. */
const finishedStatus = (subject: string, rank?: number): GameStatus => ({
  name: STATUS.FINISHED,
  data: {
    subject,
    top: [...PLAYERS],
    rank,
    // A phone is also told how many played and its own final score.
    ...(rank === undefined
      ? {}
      : { total: CROWD_SIZE, points: PHONE_PLAYER.points }),
  },
})

/** A phone's own place after a question, as the server sends it. */
const standingStatus = (leading: boolean): GameStatus => ({
  name: STATUS.SHOW_STANDING,
  data: leading
    ? {
        rank: 1,
        previousRank: 2,
        points: PHONE_PLAYER.points,
        gained: 840,
        total: CROWD_SIZE,
        ladder: [
          { rank: 1, username: "Ada", points: PHONE_PLAYER.points, me: true },
          { rank: 2, username: "Grace", points: 8_920, me: false },
        ],
        behind: null,
      }
    : {
        rank: 7,
        previousRank: 10,
        points: 5_130,
        gained: 840,
        total: CROWD_SIZE,
        ladder: [
          { rank: 1, username: "Ada", points: PHONE_PLAYER.points, me: false },
          { rank: 6, username: "Margaret", points: 5_420, me: false },
          {
            rank: 7,
            username: "Bartholomew-Alexander",
            points: 5_130,
            me: true,
          },
          { rank: 8, username: "Jean", points: 4_980, me: false },
        ],
        behind: { username: "Margaret", points: 290 },
      },
})

/** A phone's staged verdict, stamped now, for whichever outcome is wanted. */
const phoneVerdictStatus = (
  question: Question,
  outcome: "right" | "wrong" | "none",
): GameStatus => {
  const now = Date.now()
  const correct = outcome === "right"

  return {
    name: STATUS.SHOW_RESULT,
    data: {
      correct,
      message: correct ? "game:correct" : "game:wrong",
      points: correct ? 840 : 0,
      myPoints: PHONE_PLAYER.points + (correct ? 840 : 0),
      rank: correct ? 1 : 2,
      aheadOfMe: correct ? null : "Grace",
      resultsAt: now,
      serverNow: now,
      picked:
        outcome === "none" ? null : question.solutions[0] + (correct ? 0 : 1),
      correctAnswers: question.solutions.map((slot) => question.answers[slot]),
      streak: correct ? 4 : 0,
      totalPlayers: CROWD_SIZE,
      behind: correct ? null : 240,
    },
  }
}

const WAIT_FOR_ANSWERS = "game:waitingForAnswers"

/** A phone that has locked in, with part of the room already in. */
export const waitStatus = (): GameStatus => ({
  name: STATUS.WAIT,
  data: { text: WAIT_FOR_ANSWERS, answered: 11, total: CROWD_SIZE },
})

/** The question a screen is built from, and what a game needs to know about its quiz. */
export interface QuizContent {
  subject: string
  questions: readonly Question[]
}

/** The slot a 0-based index points at, kept inside the quiz. */
export const boundedIndex = (index: number, length: number): number =>
  Math.min(Math.max(0, Math.floor(index)), Math.max(0, length - 1))

/** What the phone on the "wait" screen picked, so the screen can hold it. */
export const pickForQuestion = (
  fixture: FixtureId,
  content: QuizContent,
  index: number,
): { questionNumber: number; key: number; text: string } | null => {
  if (fixture !== "wait" || content.questions.length === 0) {
    return null
  }

  const at = boundedIndex(index, content.questions.length)
  const { answers, solutions } = content.questions[at]
  const key = solutions[0] ?? 0

  return { questionNumber: at + 1, key, text: answers[key] }
}

const roomStatus = (): GameStatus => ({
  name: STATUS.SHOW_ROOM,
  data: { text: "game:waitingForPlayers", inviteCode: "426 426" },
})

/**
 * A screen in its settled state: every sentence read, every answer revealed
 * and unlocked. That is also what a reconnecting client is sent, which is why
 * it is the state the fit report measures.
 */
export const statusForQuestion = (
  fixture: FixtureId,
  content: QuizContent,
  index: number,
): GameStatus => {
  const at = boundedIndex(index, content.questions.length)
  const question = content.questions[at]
  const number = at + 1

  switch (fixture) {
    case "room":
      return roomStatus()

    case "room-30":
      return roomStatus()

    case "room-60":
      return roomStatus()

    case "start":
      return {
        name: STATUS.SHOW_START,
        data: { time: 3, subject: content.subject },
      }

    case "prepared":
      return {
        name: STATUS.SHOW_PREPARED,
        data: { totalAnswers: question.answers.length, questionNumber: number },
      }

    case "question":
      return {
        name: STATUS.SHOW_QUESTION,
        data: {
          questionNumber: number,
          question: question.question,
          media: question.media,
          cooldown: question.cooldown,
          answerCount: question.answers.length,
          promptStartedAt: 0,
          serverNow: getQuestionPromptRevealMs(question.question) + 1_000,
        },
      }

    case "answers":
      return {
        name: STATUS.SELECT_ANSWER,
        data: answerStatusData(question, number, {
          revealStartedAt: 0,
          serverNow: getAnswerRevealDuration(question.answers.length) + 1_000,
          answeringOpen: true,
        }),
      }

    case "result":
      return {
        name: STATUS.SHOW_RESULT,
        data: {
          correct: true,
          message: "game:correct",
          points: 840,
          myPoints: PHONE_PLAYER.points,
          rank: 1,
          aheadOfMe: null,
        },
      }

    case "verdict":
      return phoneVerdictStatus(question, "right")

    case "verdict-wrong":
      return phoneVerdictStatus(question, "wrong")

    case "verdict-none":
      return phoneVerdictStatus(question, "none")

    case "responses":
      return responsesStatus(question, number, { mode: "right" })

    case "responses-wrong":
      return responsesStatus(question, number, { mode: "wrong" })

    case "reveal":
      return responsesStatus(question, number, { mode: "right", live: true })

    case "reveal-wrong":
      return responsesStatus(question, number, { mode: "wrong", live: true })

    case "leaderboard":
      return { name: STATUS.SHOW_LEADERBOARD, data: leaderboardStatusData() }

    case "standing":
      return standingStatus(false)

    case "standing-lead":
      return standingStatus(true)

    case "podium":
      return finishedStatus(content.subject)

    case "finished":
      return finishedStatus(content.subject, 1)

    case "finished-mid":
      return finishedStatus(content.subject, 9)

    case "wait":
      return waitStatus()

    case "wait-lobby":
      return { name: STATUS.WAIT, data: { text: "game:waitingForPlayers" } }
  }
}
