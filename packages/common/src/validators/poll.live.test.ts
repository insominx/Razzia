import { describe, expect, it } from "vitest"
import { pollValidator } from "@razzia/common/validators/poll"

const valid = { question: "Which one?", options: ["Red", "Blue"] }

describe("pollValidator live", () => {
  it("leaves a poll sealed unless it says live: true", () => {
    expect(pollValidator.parse(valid)).not.toHaveProperty("live")
    expect(pollValidator.parse({ ...valid, live: false }).live).toBe(false)
    expect(pollValidator.parse({ ...valid, live: true }).live).toBe(true)
  })

  it.each([
    ["a string", "true"],
    ["a number", 1],
    ["null", null],
    ["an object", {}],
  ])("refuses live as %s", (_name, live) => {
    expect(pollValidator.safeParse({ ...valid, live }).success).toBe(false)
  })
})
