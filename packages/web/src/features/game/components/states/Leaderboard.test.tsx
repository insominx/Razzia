import type { PublicPlayer } from "@razzia/common/types/game"
import Leaderboard from "@razzia/web/features/game/components/states/Leaderboard"
import {
  BOARD_COMMENT_DELAY_MS,
  BOARD_HOLD_MS,
  BOARD_REORDER_MS,
} from "@razzia/web/features/game/utils/board"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const player = (id: string, points: number, streak = 0): PublicPlayer => ({
  id,
  connected: true,
  username: id,
  points,
  streak,
})

const rowOrder = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-leaderboard-row]")].map((row) => ({
    rank: row.querySelector("[data-rank-badge]")?.textContent,
    name: row.querySelector(".truncate")?.textContent,
    gained: row.querySelector("[data-points-gained]")?.textContent ?? null,
    change:
      row.querySelector("[data-place-change]")?.textContent.trim() ?? null,
  }))

const barWidths = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("[data-board-bar]")].map(
    (bar) => bar.style.width,
  )

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

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

  it("sets every name a step smaller when one is long, so the rows match", () => {
    const board = [
      { ...player("Christopher-James", 300), username: "Christopher-James" },
      { ...player("Ana", 200), username: "Ana" },
    ]
    const { container } = render(
      <Leaderboard data={{ oldLeaderboard: board, leaderboard: board }} />,
    )

    for (const name of container.querySelectorAll(".truncate")) {
      expect(name).toHaveClass("text-3xl")
    }
  })

  it("leaves the names full size when none is long", () => {
    const board = [player("Ana", 300), player("Sam", 200)]
    const { container } = render(
      <Leaderboard data={{ oldLeaderboard: board, leaderboard: board }} />,
    )

    for (const name of container.querySelectorAll(".truncate")) {
      expect(name).not.toHaveClass("text-3xl")
    }
  })

  it("holds the old standing, with each bar its share of the new longest", () => {
    const { container } = render(
      <Leaderboard
        data={{
          oldLeaderboard: [player("ada", 900), player("grace", 450)],
          leaderboard: [player("ada", 1_000), player("grace", 500)],
        }}
      />,
    )

    expect(rowOrder(container).map((row) => row.name)).toEqual(["ada", "grace"])
    expect(barWidths(container)).toEqual(["90%", "45%"])
  })

  it("grows the bars to the new scores, then swaps the rows", () => {
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

    advance(BOARD_HOLD_MS)

    // The race has started but nobody has changed places yet.
    expect(rowOrder(container).map((row) => row.name)).toEqual(["ada", "grace"])
    expect(barWidths(container)[0]).toBe(`${(900 / 1_640) * 100}%`)
    expect(barWidths(container)[1]).toBe("100%")

    advance(BOARD_REORDER_MS - BOARD_HOLD_MS)

    expect(rowOrder(container)).toEqual([
      { rank: "1", name: "grace", gained: "+840", change: "▲1" },
      { rank: "2", name: "ada", gained: null, change: "▼1" },
      // Climbed in from outside the old top five: no known previous score.
      { rank: "3", name: "linus", gained: null, change: null },
    ])
  })

  it("says one thing about the board, after the rows have swapped", () => {
    const { container } = render(
      <Leaderboard
        data={{
          oldLeaderboard: [player("ada", 900), player("grace", 800)],
          leaderboard: [player("grace", 1_640), player("ada", 900)],
        }}
      />,
    )

    advance(BOARD_REORDER_MS)
    expect(container.querySelector("[data-board-commentary]")).toBeNull()

    advance(BOARD_COMMENT_DELAY_MS)
    expect(
      container.querySelector("[data-board-commentary]")?.textContent,
    ).toBe('game:board.newLeader:{"name":"grace","other":"ada"}')
  })

  it("works for a room of one", () => {
    const { container } = render(
      <Leaderboard
        data={{
          oldLeaderboard: [player("ada", 0)],
          leaderboard: [player("ada", 840)],
        }}
      />,
    )

    advance(BOARD_REORDER_MS + BOARD_COMMENT_DELAY_MS)

    expect(rowOrder(container)).toEqual([
      { rank: "1", name: "ada", gained: "+840", change: null },
    ])
    expect(barWidths(container)).toEqual(["100%"])
    expect(
      container.querySelector("[data-board-commentary]")?.textContent,
    ).toContain("game:board.leads")
  })

  it("rolls the points through an odometer", () => {
    const { container } = render(
      <Leaderboard
        data={{
          oldLeaderboard: [player("ada", 900)],
          leaderboard: [player("ada", 1_740)],
        }}
      />,
    )

    expect(
      container.querySelector("[data-odometer]")?.getAttribute("data-odometer"),
    ).toBe("900")

    advance(BOARD_HOLD_MS)

    expect(
      container.querySelector("[data-odometer]")?.getAttribute("data-odometer"),
    ).toBe("1740")
  })

  it("starts over when a new board arrives", () => {
    const first = {
      oldLeaderboard: [player("ada", 900)],
      leaderboard: [player("ada", 1_000)],
    }
    const { container, rerender } = render(<Leaderboard data={first} />)

    advance(BOARD_REORDER_MS + BOARD_COMMENT_DELAY_MS)
    rerender(
      <Leaderboard
        data={{
          oldLeaderboard: [player("ada", 1_000)],
          leaderboard: [player("ada", 1_900)],
        }}
      />,
    )

    expect(container.querySelector("[data-board-commentary]")).toBeNull()
    expect(barWidths(container)).toEqual([`${(1_000 / 1_900) * 100}%`])
  })
})
