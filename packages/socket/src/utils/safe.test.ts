import { describe, expect, it, vi } from "vitest"
import {
  isSafeId,
  isValidClientId,
  logSafe,
  publicErrorMessage,
  requireClientId,
} from "@razzia/socket/utils/safe"

const connect = (auth: Record<string, unknown>) => {
  const next = vi.fn()
  requireClientId({ handshake: { auth } }, next)

  return next
}

describe("requireClientId", () => {
  it("lets a uuid through", () => {
    const next = connect({ clientId: "3f2b8c1e-5d4a-4e7b-9a10-0c1d2e3f4a5b" })

    expect(next).toHaveBeenCalledWith()
  })

  it.each([
    ["missing", {}],
    ["a number", { clientId: 12345678 }],
    ["an object", { clientId: { a: 1 } }],
    ["too short", { clientId: "abc" }],
    ["a megabyte long", { clientId: "a".repeat(1_000_000) }],
    ["carrying a newline", { clientId: "abcdefgh\nFAKE LOG LINE" }],
  ])("refuses a clientId that is %s", (_name, auth) => {
    const next = connect(auth)

    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it("refuses a handshake without auth at all", () => {
    const next = vi.fn()

    requireClientId(
      { handshake: {} as { auth: Record<string, unknown> } },
      next,
    )

    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe("isValidClientId", () => {
  it("rejects non strings", () => {
    expect(isValidClientId(undefined)).toBe(false)
  })
})

describe("isSafeId", () => {
  it.each(["../game", "a/b", "a\\b", "", "..", "x:y", "a\0b"])(
    "rejects %j",
    (id) => {
      expect(isSafeId(id)).toBe(false)
    },
  )

  it("accepts generated ids", () => {
    expect(isSafeId("untitled-q-8NVCk5HI")).toBe(true)
    expect(isSafeId("V1StGXR8_Z5jdHi6B-myT")).toBe(true)
  })
})

describe("publicErrorMessage", () => {
  it("forwards i18n keys and hides everything else", () => {
    expect(publicErrorMessage(new Error("errors:x.y"), "errors:fallback")).toBe(
      "errors:x.y",
    )
    expect(
      publicErrorMessage(
        new Error("ENOENT: no such file, open 'C:\\config\\a.json'"),
        "errors:fallback",
      ),
    ).toBe("errors:fallback")
    expect(publicErrorMessage("boom", "errors:fallback")).toBe(
      "errors:fallback",
    )
  })
})

describe("logSafe", () => {
  it("keeps a client string on one quoted line", () => {
    expect(logSafe("a\nPlayer admin left")).not.toContain("\n")
  })
})
