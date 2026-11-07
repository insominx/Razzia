import { getAnswerRevealDuration } from "@razzia/common/utils/answer-reveal"
import { FINAL_COUNTDOWN_SECONDS } from "@razzia/web/features/game/utils/game-constants"

/**
 * The line between the question and the answers. A dim line grows from the
 * centre across the prompt's cooldown and the answer reveal, so it is whole
 * exactly when answering opens; then it burns in from both ends toward the
 * clock for as long as the answers stay open. It is drawn on two screens (the
 * question, then the answers), so its timing is arithmetic on the server's
 * stamps and a screen that mounts late simply starts partway through.
 */

/** Payloads that predate the fields read these. */
export const DEFAULT_COOLDOWN_SECONDS = 5

export const DEFAULT_ANSWER_COUNT = 4

export interface LineSegment {
  /** Share of the full width the segment starts at, 0–1. */
  from: number
  /** Share of the full width it ends at. */
  to: number
  durationMs: number
}

const growthMs = (cooldownSeconds: number, answerCount: number) => ({
  cooldownMs: cooldownSeconds * 1_000,
  revealMs: getAnswerRevealDuration(answerCount),
})

/** The share of the whole growth that the prompt's cooldown covers. */
export const cooldownShare = (
  cooldownSeconds: number,
  answerCount: number,
): number => {
  const { cooldownMs, revealMs } = growthMs(cooldownSeconds, answerCount)

  return cooldownMs / (cooldownMs + revealMs)
}

/** On the question screen: from nothing to the end of the cooldown. */
export const questionSegment = (
  cooldownSeconds = DEFAULT_COOLDOWN_SECONDS,
  answerCount = DEFAULT_ANSWER_COUNT,
): LineSegment => ({
  from: 0,
  to: cooldownShare(cooldownSeconds, answerCount),
  durationMs: cooldownSeconds * 1_000,
})

/** On the answers screen while they are revealed: on to the whole line. */
export const revealSegment = (
  cooldownSeconds = DEFAULT_COOLDOWN_SECONDS,
  answerCount = DEFAULT_ANSWER_COUNT,
): LineSegment => ({
  from: cooldownShare(cooldownSeconds, answerCount),
  to: 1,
  durationMs: getAnswerRevealDuration(answerCount),
})

/** When, from the start of the burn, the line turns hot: the last five seconds. */
export const heatDelayMs = (answerSeconds: number): number =>
  Math.max(0, (answerSeconds - FINAL_COUNTDOWN_SECONDS) * 1_000)
