import { usernameValidator } from "@razzia/common/validators/auth"
import { describe, expect, it } from "vitest"

describe("usernameValidator", () => {
  it.each([
    ["abcd", "abcd"],
    ["  Alice  ", "Alice"],
    ["Al   ice", "Al ice"],
    ["a".repeat(20), "a".repeat(20)],
    ["たなかさん", "たなかさん"],
    ["👨‍👩‍👧", "👨‍👩‍👧"],
  ])("accepts %j as %j", (input, expected) => {
    const result = usernameValidator.safeParse(input)

    expect(result.success).toBe(true)
    expect(result.data).toBe(expected)
  })

  it.each([
    ["blank", "    "],
    ["too short after trim", " abc "],
    ["too long", "a".repeat(21)],
    ["zero-width", "​​​​"],
    ["bidi override", "‮evil"],
    ["newline", "ab\ncd"],
    ["control", "ab\u0000cd"],
  ])("rejects %s", (_name, input) => {
    expect(usernameValidator.safeParse(input).success).toBe(false)
  })
})
