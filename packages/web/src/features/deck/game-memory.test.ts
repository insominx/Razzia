import {
  forgetGame,
  recallGame,
  rememberGame,
} from "@razzia/web/features/deck/game-memory"
import { describe, expect, it } from "vitest"

const DAY_MS = 24 * 60 * 60 * 1_000

const memoryStorage = () => {
  const entries = new Map<string, string>()

  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  }
}

describe("deck game memory", () => {
  it("remembers, recalls and forgets one game per quiz", () => {
    const storage = memoryStorage()

    rememberGame({ storage, quiz: "vehicle-physics", gameId: "g1", now: 0 })
    rememberGame({ storage, quiz: "damped-springs", gameId: "g2", now: 0 })

    expect(recallGame({ storage, quiz: "vehicle-physics", now: 1_000 })).toBe(
      "g1",
    )

    forgetGame({ storage, quiz: "vehicle-physics", now: 1_000 })

    expect(
      recallGame({ storage, quiz: "vehicle-physics", now: 1_000 }),
    ).toBeNull()
    expect(recallGame({ storage, quiz: "damped-springs", now: 1_000 })).toBe(
      "g2",
    )
  })

  it("forgets a game after a day", () => {
    const storage = memoryStorage()

    rememberGame({ storage, quiz: "vehicle-physics", gameId: "g1", now: 0 })

    expect(
      recallGame({ storage, quiz: "vehicle-physics", now: DAY_MS }),
    ).toBeNull()
  })

  it("starts over from unreadable storage", () => {
    const storage = memoryStorage()
    storage.setItem("razzia_deck_games", "{not json")

    expect(recallGame({ storage, quiz: "vehicle-physics" })).toBeNull()

    rememberGame({ storage, quiz: "vehicle-physics", gameId: "g1" })

    expect(recallGame({ storage, quiz: "vehicle-physics" })).toBe("g1")
  })

  it("works without storage", () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }

    expect(() => {
      rememberGame({ storage: blocked, quiz: "vehicle-physics", gameId: "g1" })
    }).not.toThrow()
    expect(recallGame({ storage: blocked, quiz: "vehicle-physics" })).toBeNull()
    expect(recallGame({ storage: null, quiz: "vehicle-physics" })).toBeNull()
  })
})
