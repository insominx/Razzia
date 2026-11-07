import type { Question, Quizz } from "@razzia/common/types/game"
import { quizzValidator } from "@razzia/common/validators/quizz"
import {
  answerStatusData,
  CROWD_SIZE,
  type CrowdMode,
  crowdResponses,
  FIXTURES,
  type FixtureId,
  type GameStatus,
  isFixtureId,
  leaderboardStatusData,
  PHONE_PLAYER,
  pickForQuestion,
  playersFor,
  PLAYERS,
  responsesStatusData,
  statusForQuestion,
  waitStatus,
} from "@razzia/web/features/rehearse/screens"

// The builders live in `features/rehearse/screens`, shared with the editor's
// rehearsal; this file is the Director's own: the real quizzes under
// `config/quizz`, and the screens built from them.
export {
  answerStatusData,
  CROWD_SIZE,
  type CrowdMode,
  crowdResponses,
  FIXTURES,
  type FixtureId,
  type GameStatus,
  isFixtureId,
  leaderboardStatusData,
  PHONE_PLAYER,
  playersFor,
  PLAYERS,
  responsesStatusData,
  waitStatus,
}

/** A fixture built from one real question of one real quiz. */
export interface FixtureRef {
  fixture: FixtureId
  quizId: string
  /** 0-based index into the quiz. */
  question: number
}

export interface QuizEntry {
  id: string
  quiz: Quizz
}

const quizModules = import.meta.glob<unknown>(
  "../../../../../config/quizz/*.json",
  { eager: true, import: "default" },
)

const loadQuizzes = (): { quizzes: QuizEntry[]; errors: string[] } => {
  const quizzes: QuizEntry[] = []
  const errors: string[] = []

  for (const [path, raw] of Object.entries(quizModules)) {
    const id = path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/u, "")
    // The server runs quizzes through this validator, so the Director must too:
    // it turns a bare `solutions` number into the array the screens expect.
    const parsed = quizzValidator.safeParse(raw)

    if (parsed.success) {
      quizzes.push({ id, quiz: parsed.data as Quizz })
    } else {
      errors.push(`${id}: ${parsed.error.issues[0]?.message ?? "invalid"}`)
    }
  }

  return { quizzes: quizzes.sort((a, b) => a.id.localeCompare(b.id)), errors }
}

const loaded = loadQuizzes()

export const QUIZZES: readonly QuizEntry[] = loaded.quizzes

/** Quizzes under `config/quizz` that failed the app's own validator. */
export const QUIZ_LOAD_ERRORS: readonly string[] = loaded.errors

export const findQuiz = (quizId: string): QuizEntry | undefined =>
  QUIZZES.find((entry) => entry.id === quizId) ?? QUIZZES.at(0)

export interface RealQuestion {
  quizId: string
  /** 0-based. */
  index: number
  question: Question
}

export const allQuestions = (): RealQuestion[] =>
  QUIZZES.flatMap(({ id, quiz }) =>
    quiz.questions.map((question, index) => ({ quizId: id, index, question })),
  )

/** What the phone on the "wait" screen picked, so the screen can hold it. */
export const pickFor = ({ fixture, quizId, question }: FixtureRef) => {
  const entry = findQuiz(quizId)

  return entry ? pickForQuestion(fixture, entry.quiz, question) : null
}

/** A screen in its settled state, from a real quiz. */
export const statusFor = ({
  fixture,
  quizId,
  question,
}: FixtureRef): GameStatus => {
  const entry = findQuiz(quizId)

  if (!entry) {
    throw new Error("No quizzes found under config/quizz")
  }

  return statusForQuestion(fixture, entry.quiz, question)
}
