import type { PublicPlayer } from "@razzia/common/types/game"
import {
  BOARD_HOLD_MS,
  BOARD_RACE_MS,
  BOARD_REORDER_MS,
  barShare,
  boardCommentary,
  placeChange,
  podiumTimes,
} from "@razzia/web/features/game/utils/board"
import { describe, expect, it } from "vitest"

const player = (id: string, points: number): PublicPlayer => ({
  id,
  connected: true,
  username: id.toUpperCase(),
  points,
  streak: 0,
})

describe("the race's timing", () => {
  it("holds, then races, and the rows swap when the race ends", () => {
    expect(BOARD_HOLD_MS).toBeLessThan(BOARD_REORDER_MS)
    expect(BOARD_HOLD_MS + BOARD_RACE_MS).toBe(BOARD_REORDER_MS)
  })
})

describe("barShare", () => {
  it("is a share of the longest bar", () => {
    expect(barShare(500, 1_000)).toBe(0.5)
    expect(barShare(1_000, 1_000)).toBe(1)
  })

  it("stays inside the track and survives an empty board", () => {
    expect(barShare(2_000, 1_000)).toBe(1)
    expect(barShare(-5, 1_000)).toBe(0)
    expect(barShare(0, 0)).toBe(0)
  })
})

describe("placeChange", () => {
  const before = [player("a", 900), player("b", 800), player("c", 700)]
  const after = [player("b", 1_700), player("a", 900), player("c", 700)]

  it("counts places gained and lost", () => {
    expect(placeChange(before, after, "b")).toBe(1)
    expect(placeChange(before, after, "a")).toBe(-1)
    expect(placeChange(before, after, "c")).toBe(0)
  })

  it("is 0 when either board does not show the player", () => {
    expect(placeChange(before, after, "ghost")).toBe(0)
    expect(placeChange(before, [player("b", 1)], "a")).toBe(0)
  })
})

describe("boardCommentary", () => {
  it("says nothing on an empty board", () => {
    expect(boardCommentary([], [])).toBeNull()
  })

  it("names a new leader and who they took it from", () => {
    expect(
      boardCommentary(
        [player("a", 900), player("b", 800)],
        [player("b", 1_700), player("a", 900)],
      ),
    ).toEqual({
      key: "game:board.newLeader",
      values: { name: "B", other: "A" },
    })
  })

  it("names the biggest climber and who they passed", () => {
    expect(
      boardCommentary(
        [player("a", 900), player("b", 800), player("c", 700)],
        [player("a", 1_000), player("c", 950), player("b", 850)],
      ),
    ).toEqual({
      key: "game:board.overtook",
      values: { name: "C", other: "B" },
    })
  })

  it("is not fooled by the join order of the first board", () => {
    // Nobody had scored: the old order is only who joined first.
    const line = boardCommentary(
      [player("a", 0), player("b", 0), player("c", 0)],
      [player("c", 900), player("b", 500), player("a", 0)],
    )

    expect(line?.key).toBe("game:board.biggestGain")
    expect(line?.values).toEqual({ name: "C", points: "900" })
  })

  it("calls out a player who climbed into the top five", () => {
    const old = ["a", "b", "c", "d", "e"].map((id, i) =>
      player(id, 1_000 - i * 100),
    )
    const line = boardCommentary(old, [
      player("a", 1_000),
      player("f", 950),
      player("b", 900),
      player("c", 800),
      player("d", 700),
    ])

    // The newcomer is also a climber, but nobody visible was passed.
    expect(line?.key).toBe("game:board.enters")
    expect(line?.values).toEqual({ name: "F" })
  })

  it("names the biggest gain when nothing moved", () => {
    expect(
      boardCommentary(
        [player("a", 900), player("b", 500)],
        [player("a", 1_700), player("b", 600)],
      ),
    ).toEqual({
      key: "game:board.biggestGain",
      values: { name: "A", points: "800" },
    })
  })

  it("marks a close race when nobody gained", () => {
    expect(
      boardCommentary(
        [player("a", 900), player("b", 850)],
        [player("a", 900), player("b", 850)],
      ),
    ).toEqual({
      key: "game:board.tight",
      values: { name: "A", other: "B", points: "50" },
    })
  })

  it("works for a room of one", () => {
    expect(boardCommentary([player("a", 0)], [player("a", 840)])).toEqual({
      key: "game:board.leads",
      values: { name: "A", points: "840" },
    })
  })

  it("falls back to who leads", () => {
    expect(
      boardCommentary(
        [player("a", 2_000), player("b", 500)],
        [player("a", 2_000), player("b", 500)],
      ),
    ).toEqual({
      key: "game:board.leads",
      values: { name: "A", points: "2,000" },
    })
  })
})

describe("podiumTimes", () => {
  it("keeps the score's own timing for a full podium", () => {
    expect(podiumTimes(5)).toEqual({ third: 1, second: 3.5, roll: 5, first: 9 })
  })

  it("pulls everything earlier for each place that is not filled", () => {
    const two = podiumTimes(2)
    const one = podiumTimes(1)

    expect(two.third).toBeNull()
    expect(two.second).toBe(1)
    expect(two.first).toBeLessThan(9)
    expect(one.third).toBeNull()
    expect(one.second).toBeNull()
    expect(one.first).toBeLessThan(two.first)
    expect(one.roll).toBeGreaterThanOrEqual(0)
  })
})
