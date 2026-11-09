import type { PublicPlayer } from "@razzia/common/types/game"
import {
  MAX_SEATS,
  pinCells,
  seatsFor,
  seatTier,
  shortUrl,
} from "@razzia/web/features/game/utils/lobby"
import { describe, expect, it } from "vitest"

const players = (count: number): PublicPlayer[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    connected: true,
    username: `Player ${index}`,
    points: 0,
    streak: 0,
  }))

describe("shortUrl", () => {
  it("drops the scheme and any trailing slash", () => {
    expect(shortUrl("https://razzia.example.com")).toBe("razzia.example.com")
    expect(shortUrl("http://192.168.1.20:3000/")).toBe("192.168.1.20:3000")
  })

  it("leaves a bare host alone", () => {
    expect(shortUrl("razzia.example.com")).toBe("razzia.example.com")
  })
})

describe("pinCells", () => {
  it("keeps the gap in a spaced PIN", () => {
    expect(pinCells("426 426")).toEqual(["4", "2", "6", " ", "4", "2", "6"])
  })
})

describe("seatTier", () => {
  it("shrinks the names as the room fills, in four steps", () => {
    const tiers = [seatTier(5), seatTier(20), seatTier(40), seatTier(55)]

    tiers.slice(1).forEach((tier, step) => {
      expect(tiers[step].minRem).toBeGreaterThan(tier.minRem)
    })

    expect(new Set(tiers.map((tier) => tier.text)).size).toBe(4)
  })

  it("holds each tier up to its limit", () => {
    expect(seatTier(12)).toEqual(seatTier(1))
    expect(seatTier(30)).toEqual(seatTier(13))
    expect(seatTier(47)).toEqual(seatTier(31))
    expect(seatTier(60)).toEqual(seatTier(48))
  })

  it("makes a full room's rows shorter, not only its names smaller", () => {
    // Four columns of the 31-to-47 tier overflowed the frame from 48 players:
    // the compact tier has to shorten the row as well as narrow it.
    expect(seatTier(60).pad).not.toBe(seatTier(47).pad)
  })
})

describe("seatsFor", () => {
  it("draws empty seats around an empty room", () => {
    expect(seatsFor([])).toEqual({ shown: [], more: 0, empty: 12 })
  })

  it("fills the last row with empty seats", () => {
    const { shown, empty, more } = seatsFor(players(13))

    expect(shown).toHaveLength(13)
    expect(more).toBe(0)
    // The next row of four, with room to grow.
    expect(shown.length + empty).toBe(16)
  })

  it("never draws more than sixty seats and counts the rest", () => {
    const { shown, empty, more } = seatsFor(players(75))

    expect(shown).toHaveLength(MAX_SEATS)
    expect(more).toBe(15)
    expect(empty).toBe(0)
  })

  it("draws exactly sixty without a leftover count", () => {
    const { shown, more, empty } = seatsFor(players(60))

    expect(shown).toHaveLength(60)
    expect(more).toBe(0)
    expect(empty).toBe(0)
  })
})
