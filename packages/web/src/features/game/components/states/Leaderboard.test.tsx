import type { Player } from "@razzia/common/types/game"
import Leaderboard from "@razzia/web/features/game/components/states/Leaderboard"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const player = (id: string, points: number): Player => ({
  id,
  clientId: `client-${id}`,
  connected: true,
  username: id,
  points,
  streak: 0,
})

const rowOrder = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-leaderboard-row]")].map((row) => ({
    rank: row.querySelector("[data-rank-badge]")?.textContent,
    name: row.querySelector(".truncate")?.textContent,
    gained: row.querySelector("[data-points-gained]")?.textContent ?? null,
  }))

describe("Leaderboard", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("numbers rows and colours only the podium ranks", () => {
    const board = ["a", "b", "c", "d"].map((id, index) =>
      player(id, 400 - index * 100),
    )
    const { container } = render(
      <Leaderboard data={{ oldLeaderboard: board, leaderboard: board }} />,
    )

    const badges = [...container.querySelectorAll("[data-rank-badge]")]

    expect(badges.map((badge) => badge.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ])
    expect(badges[0]).toHaveClass("bg-medal-gold")
    expect(badges[1]).toHaveClass("bg-medal-silver")
    expect(badges[2]).toHaveClass("bg-medal-bronze")
    expect(badges[3]).not.toHaveClass("bg-medal-gold")
  })

  it("re-ranks after the beat and shows what each known player gained", () => {
    const { container } = render(
      <Leaderboard
        data={{
          oldLeaderboard: [player("ada", 900), player("grace", 800)],
          leaderboard: [
            player("grace", 1_640),
            player("ada", 900),
            player("linus", 700),
          ],
        }}
      />,
    )

    expect(rowOrder(container)).toEqual([
      { rank: "1", name: "ada", gained: null },
      { rank: "2", name: "grace", gained: null },
    ])

    act(() => {
      vi.advanceTimersByTime(1_600)
    })

    expect(rowOrder(container)).toEqual([
      { rank: "1", name: "grace", gained: "+840" },
      { rank: "2", name: "ada", gained: null },
      // Climbed in from outside the old top five: no known previous score.
      { rank: "3", name: "linus", gained: null },
    ])
  })
})
