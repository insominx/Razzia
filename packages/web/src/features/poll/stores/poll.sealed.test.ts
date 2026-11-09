import type { PollSnapshot } from "@razzia/common/types/poll"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { beforeEach, describe, expect, it } from "vitest"

const sealed: PollSnapshot = {
  pollId: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous: true,
  phase: "open",
  total: 0,
}

describe("the poll store with a sealed poll", () => {
  beforeEach(() => {
    usePollStore.getState().reset()
  })

  it("takes a total-only tally without inventing counts", () => {
    usePollStore.getState().apply(sealed)
    usePollStore.getState().applyTally({ pollId: "lunch", total: 2 })

    expect(usePollStore.getState().snapshot).toEqual({ ...sealed, total: 2 })
    expect(usePollStore.getState().snapshot).not.toHaveProperty("counts")
  })

  it("still takes a live tally's counts, replacing earlier ones", () => {
    usePollStore.getState().apply({ ...sealed, counts: [0, 0], live: true })
    usePollStore
      .getState()
      .applyTally({ pollId: "lunch", counts: [1, 1], total: 2 })

    expect(usePollStore.getState().snapshot).toMatchObject({
      counts: [1, 1],
      total: 2,
    })
  })

  it("ignores a tally for another poll or for a closed one", () => {
    usePollStore.getState().apply(sealed)
    usePollStore.getState().applyTally({ pollId: "other", total: 5 })

    expect(usePollStore.getState().snapshot?.total).toBe(0)

    usePollStore
      .getState()
      .apply({ ...sealed, phase: "closed", counts: [0, 0] })
    usePollStore.getState().applyTally({ pollId: "lunch", total: 9 })

    expect(usePollStore.getState().snapshot?.total).toBe(0)
  })

  it("remembers the room's player total until reset", () => {
    expect(usePollStore.getState().playerTotal).toBeNull()

    usePollStore.getState().setPlayerTotal(7)
    expect(usePollStore.getState().playerTotal).toBe(7)

    usePollStore.getState().reset()
    expect(usePollStore.getState().playerTotal).toBeNull()
  })
})
