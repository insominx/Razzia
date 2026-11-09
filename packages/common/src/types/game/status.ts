import type { PublicPlayer, QuestionMedia } from "@razzia/common/types/game"

export const STATUS = {
  SHOW_ROOM: "SHOW_ROOM",
  SHOW_START: "SHOW_START",
  SHOW_PREPARED: "SHOW_PREPARED",
  SHOW_QUESTION: "SHOW_QUESTION",
  SELECT_ANSWER: "SELECT_ANSWER",
  SHOW_RESULT: "SHOW_RESULT",
  SHOW_STANDING: "SHOW_STANDING",
  SHOW_RESPONSES: "SHOW_RESPONSES",
  SHOW_LEADERBOARD: "SHOW_LEADERBOARD",
  FINISHED: "FINISHED",
  WAIT: "WAIT",
} as const

export type Status = (typeof STATUS)[keyof typeof STATUS]

export interface CommonStatusDataMap {
  SHOW_START: { time: number; subject: string }
  SHOW_PREPARED: { totalAnswers: number; questionNumber: number }
  SHOW_QUESTION: {
    questionNumber: number
    question: string
    media?: QuestionMedia
    cooldown: number
    // How many answers will follow, so the screen knows how long the reveal
    // lasts. Absent from payloads that predate it: read it as 4.
    answerCount?: number
    promptStartedAt: number
    serverNow: number
  }
  SELECT_ANSWER: {
    questionNumber: number
    question: string
    answers: string[]
    media?: QuestionMedia
    time: number
    // The prompt's cooldown, which the charge line spans along with the reveal.
    // Absent from payloads that predate it: read it as 5.
    cooldown?: number
    totalPlayer: number
    revealStartedAt: number
    unlockAt: number
    serverNow: number
    answeringOpen: boolean
  }
  SHOW_RESULT: {
    correct: boolean
    message: string
    points: number
    myPoints: number
    rank: number
    aheadOfMe: string | null
    // Lecture games: an i18n key saying what comes next.
    note?: string
    // The staged verdict (`@razzia/common/utils/result-reveal`). A payload
    // without the stamps has no beats to stage and is shown settled.
    resultsAt?: number
    serverNow?: number
    // The slot this player tapped, or null if they did not answer.
    picked?: number | null
    // The text of every right answer, for a player who missed.
    correctAnswers?: string[]
    // Standing before this question (null in the first round), the streak of
    // right answers, how many are in the room, and the points to the player
    // ahead (null in first place).
    previousRank?: number | null
    streak?: number
    totalPlayers?: number
    behind?: number | null
  }
  // `answered` and `total` are the room's count when this player locked in.
  WAIT: { text: string; answered?: number; total?: number }
  // One player's own place after a question, sent to each phone when the host
  // shows the leaderboard: so a student outside the top five still sees where
  // they stand. `ladder` is the leader and the players around this one.
  SHOW_STANDING: {
    rank: number
    previousRank: number | null
    points: number
    gained: number
    total: number
    ladder: StandingRow[]
    behind: { username: string; points: number } | null
  }
  FINISHED: {
    subject: string
    top: PublicPlayer[]
    rank?: number
    // Players only: how many played, and this player's final score.
    total?: number
    points?: number
  }
}

export interface StandingRow {
  rank: number
  username: string
  points: number
  me: boolean
}

interface ManagerExtraStatus {
  SHOW_ROOM: { text: string; inviteCode?: string }
  SHOW_RESPONSES: {
    questionNumber: number
    question: string
    responses: Record<number, number>
    solutions: number[]
    answers: string[]
    media?: QuestionMedia
    // The staged verdict, as on `SHOW_RESULT`, plus how many are in the room
    // and who was quickest with a right answer.
    resultsAt?: number
    serverNow?: number
    totalPlayers?: number
    fastest?: { username: string; seconds: number } | null
  }
  SHOW_LEADERBOARD: {
    oldLeaderboard: PublicPlayer[]
    leaderboard: PublicPlayer[]
  }
}

export type PlayerStatusDataMap = CommonStatusDataMap

export type ManagerStatusDataMap = CommonStatusDataMap & ManagerExtraStatus

export type StatusDataMap = PlayerStatusDataMap & ManagerStatusDataMap
