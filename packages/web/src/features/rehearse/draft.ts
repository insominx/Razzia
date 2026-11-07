import { NO_TIME_LIMIT } from "@razzia/common/constants"
import type { Question } from "@razzia/common/types/game"
import { questionMediaValidator } from "@razzia/common/validators/quizz"
import type { QuizContent } from "@razzia/web/features/rehearse/screens"
import { z } from "zod"

// The editor hands the rehearsal what is on its screen, unsaved, through the
// browser's own storage: the rehearsal runs in another tab (or the same one
// after a click), and nothing about it touches the server.

export const REHEARSAL_KEY = "razzia:rehearsal"

// The draft holds the quiz's answers and /rehearse asks for no login, so on a
// shared computer it must not outlive the session it was made in. Each
// Rehearse saves it again, so this only has to outlast one sitting.
const DRAFT_TTL_MS = 4 * 60 * 60 * 1_000

const MAX_ANSWERS = 4

const MIN_COOLDOWN = 3

const MAX_COOLDOWN = 15

const DEFAULT_TIME = 20

const draftSchema = z.object({
  subject: z.string(),
  /** The question the editor was on, 0-based. */
  at: z.number().int().min(0).catch(0),
  questions: z
    .array(
      z.object({
        question: z.string(),
        media: questionMediaValidator.optional().catch(undefined),
        answers: z.array(z.string()),
        solutions: z.array(z.number().int().min(0)),
        cooldown: z.number().catch(MIN_COOLDOWN),
        time: z.number().catch(DEFAULT_TIME),
      }),
    )
    .min(1),
})

export type Draft = z.infer<typeof draftSchema>

// As kept in storage: a draft with no time on it is one an older version left
// behind indefinitely, and is treated as expired.
const savedDraftSchema = draftSchema.extend({ savedAt: z.number() })

/** Words for the parts an author has not written yet. */
export interface Placeholders {
  subject: string
  question: string
  answer: string
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high)

/**
 * A question the screens can show: what the author has typed, with a stand-in
 * for what they have not, and the limits the server would hold the quiz to.
 */
export const tidyQuestion = (
  question: Draft["questions"][number],
  placeholders: Placeholders,
): Question => {
  const answers = question.answers
    .slice(0, MAX_ANSWERS)
    .map((answer) => answer.trim() || placeholders.answer)

  while (answers.length < 2) {
    answers.push(placeholders.answer)
  }

  const solutions = question.solutions.filter((slot) => slot < answers.length)

  return {
    question: question.question.trim() || placeholders.question,
    media: question.media,
    answers,
    solutions: solutions.length > 0 ? solutions : [0],
    cooldown: clamp(Math.round(question.cooldown), MIN_COOLDOWN, MAX_COOLDOWN),
    time:
      question.time === NO_TIME_LIMIT || question.time >= 1
        ? Math.round(question.time)
        : DEFAULT_TIME,
  }
}

export const tidyDraft = (
  draft: Draft,
  placeholders: Placeholders,
): QuizContent & { at: number } => ({
  subject: draft.subject.trim() || placeholders.subject,
  questions: draft.questions.map((question) =>
    tidyQuestion(question, placeholders),
  ),
  at: Math.min(draft.at, draft.questions.length - 1),
})

const storage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    // Storage can be refused outright (a private window, blocked site data).
    return null
  }
}

/** Null for a draft that is missing, unreadable or past its time. */
export const parseDraft = (
  raw: string | null,
  now = Date.now(),
): Draft | null => {
  if (!raw) {
    return null
  }

  try {
    const parsed = savedDraftSchema.safeParse(JSON.parse(raw))

    if (!parsed.success || now - parsed.data.savedAt >= DRAFT_TTL_MS) {
      return null
    }

    const { savedAt: _savedAt, ...draft } = parsed.data

    return draft
  } catch {
    return null
  }
}

export const clearDraft = () => {
  try {
    storage()?.removeItem(REHEARSAL_KEY)
  } catch {
    // Storage that refuses this kept nothing to remove.
  }
}

/** Reads the draft, and removes one that is past its time or unreadable. */
export const loadDraft = (): Draft | null => {
  const raw = storage()?.getItem(REHEARSAL_KEY) ?? null
  const draft = parseDraft(raw)

  if (raw && !draft) {
    clearDraft()
  }

  return draft
}

/** False when the browser would not keep it, so the caller can say so. */
export const saveDraft = (draft: Draft): boolean => {
  try {
    const store = storage()

    if (!store) {
      return false
    }

    store.setItem(
      REHEARSAL_KEY,
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    )

    return true
  } catch {
    return false
  }
}

export const REHEARSAL_PATH = "/rehearse"

/** The tab the rehearsal opens in, so a second Rehearse reuses it. */
export const REHEARSAL_TARGET = "razzia-rehearsal"

/**
 * Saves the draft and opens (or refreshes) the rehearsal. Returns false when
 * the draft could not be saved, in which case nothing opens.
 */
export const openRehearsal = (draft: Draft): boolean => {
  if (!saveDraft(draft)) {
    return false
  }

  window.open(REHEARSAL_PATH, REHEARSAL_TARGET)

  return true
}
