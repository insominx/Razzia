import { usernameValidator } from "@razzia/common/validators/auth"
import { describe, expect, it } from "vitest"

describe("usernameValidator", () => {
  it.each([
    ["abcd", "abcd"],
    ["Amy", "Amy"],
    ["Bo", "Bo"],
    ["A", "A"],
    ["  é  ", "é"],
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
    ["only non-breaking spaces", "\u00a0\u00a0"],
    ["too long", "a".repeat(21)],
    ["zero-width", "​​​​"],
    ["bidi override", "‮evil"],
    ["newline", "ab\ncd"],
    ["control", "ab\u0000cd"],
  ])("rejects %s", (_name, input) => {
    expect(usernameValidator.safeParse(input).success).toBe(false)
  })

  it("asks for a name when nothing is left after trimming", () => {
    const result = usernameValidator.safeParse("  \u00a0 ")

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe("errors:auth.usernameTooShort")
  })

  it("still refuses a 21-character name with the length message", () => {
    const result = usernameValidator.safeParse("a".repeat(21))

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe("errors:auth.usernameTooLong")
  })
})
