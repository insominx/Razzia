import { ANSWERS_LABELS } from "@razzia/web/features/game/utils/constants"

/**
 * What the crowd did, and the one line that says so. The line is the speaker
 * note ("ask someone from the biggest wrong bar why") staged as the climax of
 * the round, so the cases that matter are named: the room fooled, the room
 * right, everyone right, and nobody there.
 */

export interface Crowd {
  /** Slot indexes, in order. */
  solutions: readonly number[]
  /** How many answered, and how many of those were right. */
  answered: number
  right: number
  /** Everyone in the room, whether or not they answered. */
  of: number
  /** The most-picked slots: one, or several that tie. Empty if nobody answered. */
  top: number[]
  /** The most-picked wrong slots and how many picked each. */
  topWrong: { slots: number[]; count: number } | null
  /** At least one of the most-picked answers is a right one. */
  crowdRight: boolean
  /** Everyone in the room answered, so the clock did not have to run out. */
  allIn: boolean
}

const slotsWithMost = (
  counts: readonly number[],
  among: readonly number[],
): { slots: number[]; count: number } => {
  const count = Math.max(0, ...among.map((slot) => counts[slot] ?? 0))

  return {
    count,
    slots: count === 0 ? [] : among.filter((slot) => counts[slot] === count),
  }
}

export const analyzeCrowd = (
  responses: Record<number, number>,
  solutions: readonly number[],
  { answerCount, totalPlayers }: { answerCount: number; totalPlayers?: number },
): Crowd => {
  const slots = Array.from({ length: answerCount }, (_, slot) => slot)
  const counts = slots.map((slot) => responses[slot] || 0)
  const answered = counts.reduce((sum, count) => sum + count, 0)
  const right = solutions.reduce((sum, slot) => sum + (counts[slot] ?? 0), 0)
  const of = Math.max(totalPlayers ?? answered, answered)
  const top = slotsWithMost(counts, slots).slots
  const wrong = slotsWithMost(
    counts,
    slots.filter((slot) => !solutions.includes(slot)),
  )

  return {
    solutions,
    answered,
    right,
    of,
    top,
    topWrong: wrong.slots.length > 0 ? wrong : null,
    crowdRight: top.some((slot) => solutions.includes(slot)),
    allIn: answered > 0 && answered >= of,
  }
}

export type HeadlineKind = "nobody" | "everyone" | "crowdRight" | "crowdWrong"

export interface Headline {
  kind: HeadlineKind
  right: number
  of: number
  /** For `crowdWrong`: how many fell for the biggest wrong answer(s). */
  wrong: number
  /** For `crowdWrong`: those answers' letters, A to D. */
  letters: string[]
}

export const headlineFor = (crowd: Crowd): Headline => {
  const base = {
    right: crowd.right,
    of: crowd.of,
    wrong: crowd.topWrong?.count ?? 0,
    letters: (crowd.topWrong?.slots ?? []).map((slot) => ANSWERS_LABELS[slot]),
  }

  if (crowd.answered === 0) {
    return { ...base, kind: "nobody" }
  }

  if (crowd.right >= crowd.of) {
    return { ...base, kind: "everyone" }
  }

  return { ...base, kind: crowd.crowdRight ? "crowdRight" : "crowdWrong" }
}

/** "B", "B and C", "B, C and D": the way the language lists them. */
export const listLetters = (
  letters: readonly string[],
  lng: string,
): string => {
  try {
    return new Intl.ListFormat(lng, {
      style: "long",
      type: "conjunction",
    }).format(letters)
  } catch {
    return letters.join(", ")
  }
}
