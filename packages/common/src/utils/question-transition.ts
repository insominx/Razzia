export const QUESTION_NUMBER_INTRO_MS = 1_000

export const QUESTION_NUMBER_FADE_MS = 500

export const QUESTION_CONTENT_ENTER_MS = 950

export const QUESTION_SENTENCE_FADE_MS = 500

export const QUESTION_SENTENCE_MS_PER_CHAR = 80

export const QUESTION_SENTENCE_MIN_DWELL_MS = 400

export const splitQuestionSentences = (text: string): string[] => {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  return parts.length > 0 ? parts : [text]
}

export const getQuestionSentenceIntervalMs = (sentence: string): number =>
  QUESTION_SENTENCE_FADE_MS +
  Math.max(
    QUESTION_SENTENCE_MIN_DWELL_MS,
    sentence.length * QUESTION_SENTENCE_MS_PER_CHAR,
  )

export const getQuestionSentenceStartElapsed = (
  text: string,
  index: number,
): number => {
  const sentences = splitQuestionSentences(text)
  const last = Math.max(0, Math.min(Math.floor(index), sentences.length))
  let elapsed = 0

  for (let i = 0; i < last; i += 1) {
    elapsed += getQuestionSentenceIntervalMs(sentences[i])
  }

  return elapsed
}

export const getQuestionPromptRevealMs = (text: string): number => {
  const sentences = splitQuestionSentences(text)

  if (sentences.length <= 1) {
    return QUESTION_CONTENT_ENTER_MS
  }

  return (
    getQuestionSentenceStartElapsed(text, sentences.length - 1) +
    QUESTION_SENTENCE_FADE_MS
  )
}

export const getQuestionSentenceFadeMs = (text: string): number =>
  splitQuestionSentences(text).length <= 1
    ? QUESTION_CONTENT_ENTER_MS
    : QUESTION_SENTENCE_FADE_MS

export const getVisibleSentenceCount = (
  text: string,
  elapsedMs: number,
): number => {
  const sentences = splitQuestionSentences(text)

  if (sentences.length <= 1) {
    return 1
  }

  const elapsed = Math.max(0, elapsedMs)
  let start = 0
  let visible = 1

  for (let i = 0; i < sentences.length - 1; i += 1) {
    start += getQuestionSentenceIntervalMs(sentences[i])

    if (elapsed < start) {
      break
    }

    visible = i + 2
  }

  return visible
}

export const getNextSentenceRevealElapsed = (
  text: string,
  visibleCount: number,
): number | null => {
  const count = splitQuestionSentences(text).length
  const visible = Math.max(0, Math.floor(visibleCount))

  return count <= 1 || visible >= count
    ? null
    : getQuestionSentenceStartElapsed(text, visible)
}
