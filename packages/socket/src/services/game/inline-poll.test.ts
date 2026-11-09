import { inlinePollOf } from "@razzia/socket/services/game/inline-poll"
import { describe, expect, it } from "vitest"

const valid = {
  id: "path-pick",
  question: "Which path fits you?",
  options: ["Full game", "Minigame"],
}

describe("inlinePollOf", () => {
  it("takes a definition as a stored poll would", () => {
    expect(inlinePollOf(valid)).toEqual({
      id: "path-pick",
      question: "Which path fits you?",
      options: ["Full game", "Minigame"],
      anonymous: true,
    })
  })

  it("keeps anonymous and live as sent, and leaves live out when it is not sent", () => {
    expect(inlinePollOf({ ...valid, anonymous: false, live: true })).toEqual({
      ...valid,
      anonymous: false,
      live: true,
    })
    expect(inlinePollOf(valid)).not.toHaveProperty("live")
  })

  it("trims the words and takes up to six options and the limits", () => {
    const options = ["a", "b", "c", "d", "e", "f"].map((o) => `  ${o}  `)

    expect(
      inlinePollOf({
        ...valid,
        id: "a".repeat(64),
        question: `  ${"q".repeat(500)}  `,
        options,
      }),
    ).toEqual(
      expect.objectContaining({
        question: "q".repeat(500),
        options: ["a", "b", "c", "d", "e", "f"],
      }),
    )
    expect(
      inlinePollOf({ ...valid, options: ["x".repeat(200), "y"] }),
    ).not.toBeNull()
  })

  it.each([
    ["a missing id", { ...valid, id: undefined }],
    ["an empty id", { ...valid, id: "" }],
    ["an id with a capital", { ...valid, id: "Path" }],
    ["an id that starts with a hyphen", { ...valid, id: "-path" }],
    ["an id of 65 characters", { ...valid, id: "a".repeat(65) }],
    ["an id with a slash", { ...valid, id: "a/b" }],
    ["an id with dots", { ...valid, id: "a..b" }],
    ["an id with a space", { ...valid, id: "a b" }],
    ["an id that is a number", { ...valid, id: 7 }],
    ["an empty question", { ...valid, question: "   " }],
    ["a question of 501 characters", { ...valid, question: "q".repeat(501) }],
    ["a question that is a number", { ...valid, question: 7 }],
    ["one option", { ...valid, options: ["only"] }],
    ["seven options", { ...valid, options: "abcdefg".split("") }],
    ["an empty option", { ...valid, options: ["a", " "] }],
    [
      "an option of 201 characters",
      { ...valid, options: ["a", "b".repeat(201)] },
    ],
    ["options differing only in case", { ...valid, options: ["Yes", "yes"] }],
    ["options that are not strings", { ...valid, options: [1, 2] }],
    ["options that are a string", { ...valid, options: "ab" }],
    ["options that are an object", { ...valid, options: { 0: "a", 1: "b" } }],
    ["anonymous as a string", { ...valid, anonymous: "false" }],
    ["live as a number", { ...valid, live: 1 }],
  ])("refuses %s", (_name, definition) => {
    expect(inlinePollOf(definition)).toBeNull()
  })

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "path-pick"],
    ["a number", 7],
    ["an array", [valid]],
    ["a function", () => valid],
    ["a buffer", Buffer.from(JSON.stringify(valid))],
  ])("refuses %s as a whole definition", (_name, definition) => {
    expect(inlinePollOf(definition)).toBeNull()
  })

  it("refuses a huge options list without walking it", () => {
    const options = Array.from({ length: 1_000_000 }, () => "x")
    const started = performance.now()

    expect(inlinePollOf({ ...valid, options })).toBeNull()
    expect(performance.now() - started).toBeLessThan(50)
  })

  it("reads only its five fields, so nothing smuggled in comes along", () => {
    const hostile = JSON.parse(
      '{"id":"x","question":"q","options":["a","b"],"__proto__":{"anonymous":false,"live":true},"constructor":{"prototype":{"live":true}},"extra":1}',
    ) as unknown
    const poll = inlinePollOf(hostile)

    expect(poll).toEqual({
      id: "x",
      question: "q",
      options: ["a", "b"],
      anonymous: true,
    })
    expect(({} as Record<string, unknown>).live).toBeUndefined()
  })

  it("keeps markup as text", () => {
    const question = "<img src=x onerror=alert(1)> {{x}} $y"
    const poll = inlinePollOf({ ...valid, question, options: ["<b>", "</b>"] })

    expect(poll?.question).toBe(question)
    expect(poll?.options).toEqual(["<b>", "</b>"])
  })
})
