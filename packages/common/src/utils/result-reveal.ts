/**
 * The verdict is staged, and the room and every phone stage it together. The
 * server stamps the moment answering ended (`resultsAt`) and the time it sent
 * the payload (`serverNow`); every client works out how far into the reveal it
 * is from those two and its own clock, exactly as the answer reveal does
 * (`answer-reveal.ts`). Pressing Next skips ahead: the clock only decides what
 * to draw, never what the server may do.
 *
 *   0.00 s  TIME            the frame floods hot, "TIME" (or "ALL IN")
 *   0.60 s  the count       rails grow from the letter blocks, smallest first
 *   2.25 s  the question    all but the most-picked answer go dark; a heartbeat
 *   3.00 s  the strike      the right answer floods the frame, then settles
 *   4.50 s  settled         the final grid, and the headline
 *
 * A client that arrives after the end (a reconnect, a woken phone, a lecture
 * review) is already settled and sees no flood and hears no sound.
 */

export const RESULT_TIME_MS = 0

export const RESULT_COUNT_MS = 600

export const RESULT_SPOTLIGHT_MS = 2_250

export const RESULT_STRIKE_MS = 3_000

/** How long the strike's flood takes to fill the frame, hold, and collapse. */
export const RESULT_FLOOD_MS = 1_500

export const RESULT_SETTLED_MS = RESULT_STRIKE_MS + RESULT_FLOOD_MS

/** A bar's grow, and the gap between one answer's rail and the next. */
export const RESULT_RAIL_GROW_MS = 700

export const RESULT_RAIL_STAGGER_MS = 300

/** The headline and the fastest player appear this long after the strike. */
export const RESULT_HEADLINE_MS = RESULT_STRIKE_MS + 1_450

export const RESULT_FASTEST_MS = RESULT_STRIKE_MS + 1_600

/** A phone holds its points back this long so heads stay up on the verdict. */
export const RESULT_PHONE_DETAILS_MS = RESULT_STRIKE_MS + 2_000

/**
 * The last thing the reveal does: the clock runs this far so the headline, the
 * fastest player and a phone's details all land, and a screen with nothing to
 * stage (a saved result, a late reconnect) is taken to here at once.
 */
export const RESULT_DONE_MS = Math.max(
  RESULT_SETTLED_MS,
  RESULT_HEADLINE_MS,
  RESULT_FASTEST_MS,
  RESULT_PHONE_DETAILS_MS,
)

export type ResultPhase = "time" | "count" | "spotlight" | "strike" | "settled"

/** Which beat `elapsedMs` into the reveal falls in. Before the start is TIME. */
export const getResultPhase = (elapsedMs: number): ResultPhase => {
  if (elapsedMs >= RESULT_SETTLED_MS) {
    return "settled"
  }

  if (elapsedMs >= RESULT_STRIKE_MS) {
    return "strike"
  }

  if (elapsedMs >= RESULT_SPOTLIGHT_MS) {
    return "spotlight"
  }

  if (elapsedMs >= RESULT_COUNT_MS) {
    return "count"
  }

  return "time"
}

/**
 * How far into the reveal a client is. A payload with no `resultsAt` (a saved
 * result a lecture deck shows again, or one from before the reveal existed)
 * has no beat to stage, so it is already settled.
 */
export const getResultElapsed = (
  stamps: { resultsAt?: number; serverNow?: number },
  localElapsedMs = 0,
): number =>
  stamps.resultsAt === undefined || stamps.serverNow === undefined
    ? RESULT_DONE_MS
    : Math.max(0, stamps.serverNow - stamps.resultsAt) + localElapsedMs

/**
 * The next moment anything on screen changes (a phase, the headline, the
 * fastest player, a phone's details), or null once the reveal is done.
 */
export const getNextResultBoundary = (elapsedMs: number): number | null => {
  const boundaries = [
    RESULT_COUNT_MS,
    RESULT_SPOTLIGHT_MS,
    RESULT_STRIKE_MS,
    RESULT_HEADLINE_MS,
    RESULT_SETTLED_MS,
    RESULT_FASTEST_MS,
    RESULT_PHONE_DETAILS_MS,
    RESULT_DONE_MS,
  ].sort((a, b) => a - b)

  return boundaries.find((boundary) => boundary > elapsedMs) ?? null
}

/**
 * When rail number `order` (0 is the smallest share) starts to grow. Smallest
 * first, so the biggest bar lands last and reads as the answer.
 */
export const getRailStartMs = (order: number): number =>
  RESULT_COUNT_MS + Math.max(0, order) * RESULT_RAIL_STAGGER_MS

/** The order the rails grow in: slot indexes, smallest share first. */
export const getRailOrder = (counts: readonly number[]): number[] =>
  counts
    .map((count, slot) => ({ count, slot }))
    .sort((a, b) => a.count - b.count || a.slot - b.slot)
    .map(({ slot }) => slot)
