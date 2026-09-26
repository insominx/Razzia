import type { MEDIA_TYPES } from "@razzia/common/constants"
import type { VisualsConfig } from "@razzia/common/types/visuals"

export interface Player {
  id: string
  clientId: string
  connected: boolean
  username: string
  points: number
  streak: number
}

// A player's clientId is their reconnect credential, and a host's clientId is
// also their manager login, so it never leaves the server. `never` makes the
// compiler reject a full Player wherever a PublicPlayer is sent.
export type PublicPlayer = Omit<Player, "clientId"> & { clientId?: never }

export interface Answer {
  // The socket id changes on reconnect; the clientId does not.
  clientId: string
  answerId: number
  points: number
}

export type QuestionMediaType =
  | (typeof MEDIA_TYPES)[keyof typeof MEDIA_TYPES]
  | undefined

export interface QuestionMedia {
  type?: QuestionMediaType
  url: string
}

export interface Question {
  question: string
  media?: QuestionMedia
  answers: string[]
  solutions: number[]
  cooldown: number
  time: number
}

export interface Quizz {
  subject: string
  visuals?: VisualsConfig
  questions: Question[]
}

export type QuizzWithId = Quizz & { id: string }

export interface QuizzMeta {
  id: string
  subject: string
}

export interface GameUpdateQuestion {
  current: number
  total: number
}

export interface PlayerAnswerRecord {
  playerName: string
  answerId: number | null
}

export type QuestionResult = Question & {
  playerAnswers: PlayerAnswerRecord[]
}

export interface GameResultPlayer {
  username: string
  points: number
  rank: number
}

export interface GameResult {
  id: string
  subject: string
  date: string
  players: GameResultPlayer[]
  questions: QuestionResult[]
}

export interface GameResultMeta {
  id: string
  subject: string
  date: string
  playerCount: number
}
