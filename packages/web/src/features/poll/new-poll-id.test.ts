import { newPollId } from "@razzia/web/features/poll/new-poll-id"
import { describe, expect, it } from "vitest"

// The server accepts only this shape for a new poll's name.
const SERVER_NEW_POLL_ID = /^[A-Za-z0-9_-]{8,64}$/u

describe("newPollId", () => {
  it("makes a name the server will take", () => {
    expect(newPollId()).toMatch(SERVER_NEW_POLL_ID)
  })

  it("makes a different name each time", () => {
    const names = new Set(Array.from({ length: 200 }, newPollId))

    expect(names.size).toBe(200)
  })

  it("is recognisable as a poll's", () => {
    expect(newPollId()).toMatch(/^poll-[0-9a-f]{24}$/u)
  })
})
