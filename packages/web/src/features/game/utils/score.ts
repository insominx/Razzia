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
