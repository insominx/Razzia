// The return is keyed per *answered* slot, so the value type admits `undefined`
// for a slot nobody picked — the caller has to decide what an absent share
// looks like rather than inheriting an index signature's lie.
export const calculatePercentages = (
  objectResponses: Record<string, number>,
): Record<string, string | undefined> => {
  const keys = Object.keys(objectResponses)
  const values = Object.values(objectResponses)

  if (!values.length) {
    return {}
  }

  const totalSum = values.reduce(
    (accumulator, currentValue) => accumulator + currentValue,
    0,
  )

  const result: Record<string, string> = {}

  // A question every player skipped still has a key per answer, and the bars
  // read the result as a width — an unguarded divide would paint `NaN%`, which
  // a width falls back to full, not empty.
  keys.forEach((key) => {
    result[key] = totalSum
      ? `${((objectResponses[key] / totalSum) * 100).toFixed()}%`
      : "0%"
  })

  return result
}

export interface VoteShare {
  count: number
  /** Whole percent of the people who answered, 0–100. */
  percent: number
}

/**
 * One share per answer slot, in slot order. A share is of the people who
 * answered, not of everyone in the room, so a slot nobody picked is 0 and a
 * question nobody answered is all zeros rather than a divide by nothing.
 */
export const voteShares = (
  responses: Record<number, number>,
  answerCount: number,
): VoteShare[] => {
  const counts = Array.from(
    { length: answerCount },
    (_, slot) => responses[slot] || 0,
  )
  const total = counts.reduce((sum, count) => sum + count, 0)

  return counts.map((count) => ({
    count,
    percent: total ? Math.round((count / total) * 100) : 0,
  }))
}
