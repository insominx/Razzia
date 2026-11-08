import { describe, expect, it } from "vitest"
import {
  POLL_LIMITS,
  pollResultValidator,
  pollValidator,
} from "@razzia/common/validators/poll"

const valid = { question: "Which one?", options: ["Red", "Blue"] }

const firstMessage = (data: unknown) => {
  const result = pollValidator.safeParse(data)

  return result.success ? null : result.error.issues[0].message
}

describe("pollValidator", () => {
  it("accepts a question with two to six options", () => {
    for (const count of [2, 6]) {
      const options = Array.from({ length: count }, (_, i) => `Option ${i}`)

      expect(pollValidator.safeParse({ ...valid, options }).success).toBe(true)
    }
  })

  it("makes a poll anonymous unless it says otherwise", () => {
    expect(pollValidator.parse(valid).anonymous).toBe(true)
    expect(pollValidator.parse({ ...valid, anonymous: false }).anonymous).toBe(
      false,
    )
  })

  it("trims the question and the options", () => {
    expect(
      pollValidator.parse({ question: "  Q  ", options: [" A ", "B "] }),
    ).toMatchObject({ question: "Q", options: ["A", "B"] })
  })

  it("turns away an empty question or option", () => {
    expect(firstMessage({ ...valid, question: "   " })).toBe(
      "errors:poll.questionEmpty",
    )
    expect(firstMessage({ ...valid, options: ["A", " "] })).toBe(
      "errors:poll.optionEmpty",
    )
  })

  it("turns away fewer than two or more than six options", () => {
    expect(firstMessage({ ...valid, options: ["A"] })).toBe(
      "errors:poll.tooFewOptions",
    )
    expect(
      firstMessage({
        ...valid,
        options: ["1", "2", "3", "4", "5", "6", "7"],
      }),
    ).toBe("errors:poll.tooManyOptions")
  })

  it("turns away options that differ only by case", () => {
    expect(firstMessage({ ...valid, options: ["Yes", "yes"] })).toBe(
      "errors:poll.duplicateOption",
    )
  })

  it("limits the length of the question and of an option", () => {
    expect(
      firstMessage({
        ...valid,
        question: "x".repeat(POLL_LIMITS.QUESTION + 1),
      }),
    ).toBe("errors:poll.textTooLong")
    expect(
      firstMessage({
        ...valid,
        options: ["A", "x".repeat(POLL_LIMITS.OPTION + 1)],
      }),
    ).toBe("errors:poll.textTooLong")
  })

  it("turns away data that is not a poll", () => {
    expect(pollValidator.safeParse(null).success).toBe(false)
    expect(pollValidator.safeParse({ question: "Q" }).success).toBe(false)
    expect(
      pollValidator.safeParse({ ...valid, anonymous: "yes" }).success,
    ).toBe(false)
  })
})

describe("pollResultValidator", () => {
  const record = {
    id: "1700000000000-abcd1234",
    pollId: "lunch",
    question: "Lunch?",
    options: ["Pizza", "Soup"],
    anonymous: true,
    date: "2026-11-08T12:00:00.000Z",
    gameSubject: "Lecture 4",
    counts: [3, 1],
    total: 4,
  }

  it("accepts what a closed poll leaves behind", () => {
    expect(pollResultValidator.parse(record)).toEqual(record)
    expect(
      pollResultValidator.parse({ ...record, partial: true }),
    ).toMatchObject({ partial: true })
  })

  it("keeps who voted for what in a named poll", () => {
    const named = {
      ...record,
      anonymous: false,
      voters: [{ username: "Alice", option: 0 }],
    }

    expect(pollResultValidator.parse(named)).toEqual(named)
  })

  it("drops any names from an anonymous poll, whatever the file says", () => {
    const parsed = pollResultValidator.parse({
      ...record,
      voters: [{ username: "Alice", option: 0 }],
    })

    expect(parsed).not.toHaveProperty("voters")
    expect(JSON.stringify(parsed)).not.toContain("Alice")
  })

  it("turns away a record that is not one", () => {
    expect(pollResultValidator.safeParse(null).success).toBe(false)
    expect(
      pollResultValidator.safeParse({ ...record, counts: [-1] }).success,
    ).toBe(false)
    expect(
      pollResultValidator.safeParse({ ...record, options: [] }).success,
    ).toBe(false)
    expect(pollResultValidator.safeParse({ ...record, id: "" }).success).toBe(
      false,
    )
  })
})
