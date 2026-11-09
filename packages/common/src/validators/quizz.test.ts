import { EXAMPLE_QUIZZ } from "@razzia/common/constants"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { describe, expect, it } from "vitest"

const question = (over: Record<string, unknown> = {}) => ({
  question: "q",
  answers: ["a", "b"],
  solutions: [0],
  cooldown: 5,
  time: 10,
  ...over,
})

const quizz = (over: Record<string, unknown> = {}) => ({
  subject: "s",
  questions: [question()],
  ...over,
})

const ok = (value: unknown) => quizzValidator.safeParse(value).success

describe("quizzValidator", () => {
  it("accepts the example quizz", () => {
    expect(ok(EXAMPLE_QUIZZ)).toBe(true)
  })

  it.each([-1, 1, 600])("accepts time %d", (time) => {
    expect(ok(quizz({ questions: [question({ time })] }))).toBe(true)
  })

  it.each([0, -2, -5, 601, 1e9, 1.5])("rejects time %d", (time) => {
    expect(ok(quizz({ questions: [question({ time })] }))).toBe(false)
  })

  it.each([
    ["out of range", [5]],
    ["equal to length", [2]],
    ["duplicate", [0, 0]],
  ])("rejects solutions %s", (_n, solutions) => {
    expect(ok(quizz({ questions: [question({ solutions })] }))).toBe(false)
  })

  it("rejects blank text", () => {
    expect(ok(quizz({ subject: "   " }))).toBe(false)
    expect(ok(quizz({ questions: [question({ question: "\n" })] }))).toBe(false)
    expect(ok(quizz({ questions: [question({ answers: ["  ", "b"] })] }))).toBe(
      false,
    )
  })

  it("rejects oversized text and question lists", () => {
    expect(ok(quizz({ subject: "x".repeat(201) }))).toBe(false)
    expect(
      ok(quizz({ questions: [question({ question: "x".repeat(501) })] })),
    ).toBe(false)
    expect(
      ok(quizz({ questions: [question({ answers: ["x".repeat(201), "b"] })] })),
    ).toBe(false)
    expect(ok(quizz({ questions: Array(201).fill(question()) }))).toBe(false)
  })

  it.each([
    ["https://example.com/a.png", true],
    ["http://example.com/a.png", true],
    // oxlint-disable-next-line no-script-url
    ["javascript:alert(1)", false],
    ["data:text/html,x", false],
    ["file:///etc/passwd", false],
  ])("media url %s -> %s", (url, expected) => {
    expect(ok(quizz({ questions: [question({ media: { url } })] }))).toBe(
      expected,
    )
  })
})
