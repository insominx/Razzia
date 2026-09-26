export const ANSWER_REVEAL_INITIAL_DELAY_MS = 1_000

export const ANSWER_REVEAL_FADE_MS = 2_000

export const ANSWER_REVEAL_HOLD_MS = 1_000

export const ANSWER_REVEAL_SLOT_INTERVAL_MS =
  ANSWER_REVEAL_FADE_MS + ANSWER_REVEAL_HOLD_MS

const normalizeAnswerCount = (answerCount: number): number =>
  Math.max(0, Math.floor(answerCount))

export const getAnswerRevealDuration = (answerCount: number): number => {
  const count = normalizeAnswerCount(answerCount)

  if (count === 0) {
    return 0
  }

  return (
    ANSWER_REVEAL_INITIAL_DELAY_MS +
    (count - 1) * ANSWER_REVEAL_SLOT_INTERVAL_MS +
    ANSWER_REVEAL_FADE_MS
  )
}

export const getVisibleAnswerCount = (
  answerCount: number,
  elapsedMs: number,
): number => {
  const count = normalizeAnswerCount(answerCount)

  if (count === 0 || elapsedMs < ANSWER_REVEAL_INITIAL_DELAY_MS) {
    return 0
  }

  return Math.min(
    count,
    Math.floor(
      (elapsedMs - ANSWER_REVEAL_INITIAL_DELAY_MS) /
        ANSWER_REVEAL_SLOT_INTERVAL_MS,
    ) + 1,
  )
}

export const getNextAnswerRevealElapsed = (
  answerCount: number,
  visibleCount: number,
): number | null => {
  const count = normalizeAnswerCount(answerCount)
  const visible = Math.max(0, Math.floor(visibleCount))

  return visible >= count
    ? null
    : ANSWER_REVEAL_INITIAL_DELAY_MS + visible * ANSWER_REVEAL_SLOT_INTERVAL_MS
}
