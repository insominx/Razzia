// The name a new poll is saved under, chosen by whoever creates it so that
// saving it again finds it. Built on getRandomValues, which every page has;
// randomUUID needs a secure page, and a classroom server may be plain http.
export const newPollId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(12))

  return `poll-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}
