import {
  detectDeckEmbed,
  isAllowedDeckOrigin,
} from "@razzia/web/features/deck/embed"
import { describe, expect, it } from "vitest"

const memoryStorage = () => {
  const entries = new Map<string, string>()

  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  }
}

const blockedStorage = {
  getItem: (): string | null => {
    throw new Error("blocked")
  },
  setItem: () => {
    throw new Error("blocked")
  },
}

describe("detectDeckEmbed", () => {
  it("turns on in a frame the deck opened with ?embed=deck, and keeps it", () => {
    const storage = memoryStorage()

    expect(
      detectDeckEmbed({
        search: "?embed=deck",
        framed: true,
        parentIsTop: true,
        storage,
      }),
    ).toBe(true)
    expect(
      detectDeckEmbed({ search: "", framed: true, parentIsTop: true, storage }),
    ).toBe(true)
  })

  it("stays off outside a frame, even with the flag", () => {
    expect(
      detectDeckEmbed({
        search: "?embed=deck",
        framed: false,
        parentIsTop: true,
        storage: memoryStorage(),
      }),
    ).toBe(false)
  })

  it("stays off below another frame, as in a presenter thumbnail", () => {
    expect(
      detectDeckEmbed({
        search: "?embed=deck",
        framed: true,
        parentIsTop: false,
        storage: memoryStorage(),
      }),
    ).toBe(false)
  })

  it("stays off in a frame that never asked for it", () => {
    expect(
      detectDeckEmbed({
        search: "?pin=123456",
        framed: true,
        parentIsTop: true,
        storage: memoryStorage(),
      }),
    ).toBe(false)
  })

  it("still trusts the query when storage is blocked", () => {
    expect(
      detectDeckEmbed({
        search: "?embed=deck",
        framed: true,
        parentIsTop: true,
        storage: blockedStorage,
      }),
    ).toBe(true)
    expect(
      detectDeckEmbed({
        search: "",
        framed: true,
        parentIsTop: true,
        storage: blockedStorage,
      }),
    ).toBe(false)
  })
})

describe("isAllowedDeckOrigin", () => {
  it.each([
    "https://426.csumb.workers.dev",
    "http://localhost:8776",
    "http://127.0.0.1:5500",
    "http://localhost",
  ])("accepts %s", (origin) => {
    expect(isAllowedDeckOrigin(origin)).toBe(true)
  })

  it.each([
    "http://426.csumb.workers.dev",
    "https://426.csumb.workers.dev.evil.com",
    "https://evil.workers.dev",
    "https://localhost:8776",
    "http://localhost:8776/deck",
    "null",
    "",
  ])("refuses %s", (origin) => {
    expect(isAllowedDeckOrigin(origin)).toBe(false)
  })
})
