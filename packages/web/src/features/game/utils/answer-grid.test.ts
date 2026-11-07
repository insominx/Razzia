import {
  ANSWER_GRID_TRACKS,
  answerSlotPlacement,
} from "@razzia/web/features/game/utils/game-constants"
import { describe, expect, it } from "vitest"

describe("answer grid placement", () => {
  it("stacks on one track off the stage and runs four on it", () => {
    expect(ANSWER_GRID_TRACKS.stage).toBe("grid-cols-1 stage:grid-cols-4")
    expect(ANSWER_GRID_TRACKS.container).toBe("grid-cols-1 @xl:grid-cols-4")
  })

  it("spans every tile across two tracks for even answer counts", () => {
    for (const count of [2, 4]) {
      expect(
        Array.from({ length: count }, (_, index) =>
          answerSlotPlacement(index, count),
        ),
      ).toEqual(Array.from({ length: count }, () => "stage:col-span-2"))
    }
  })

  it("centres only the odd last tile of a three-answer question", () => {
    expect([0, 1, 2].map((index) => answerSlotPlacement(index, 3))).toEqual([
      "stage:col-span-2",
      "stage:col-span-2",
      "stage:col-span-2 stage:col-start-2",
    ])
  })

  it("uses container breakpoints for tiles squeezed between editor panels", () => {
    expect(
      [0, 1, 2].map((index) => answerSlotPlacement(index, 3, "container")),
    ).toEqual([
      "@xl:col-span-2",
      "@xl:col-span-2",
      "@xl:col-span-2 @xl:col-start-2",
    ])
  })
})
