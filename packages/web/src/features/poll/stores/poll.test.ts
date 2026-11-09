import type { PollSnapshot } from "@razzia/common/types/poll"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { beforeEach, describe, expect, it } from "vitest"

const open = (extra: Partial<PollSnapshot> = {}): PollSnapshot => ({
  pollId: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous: true,
  phase: "open",
  counts: [0, 0],
  total: 0,
  ...extra,
})

describe("usePollStore", () => {
  beforeEach(() => {
    usePollStore.getState().reset()
  })

  it("starts with no poll showing", () => {
    expect(usePollStore.getState().snapshot).toBeNull()
  })

  it("replaces the snapshot wholesale, and clears it on null", () => {
    usePollStore.getState().apply(open({ mine: 1 }))
    usePollStore.getState().apply(open({ phase: "closed" }))

    expect(usePollStore.getState().snapshot).toEqual(open({ phase: "closed" }))
    expect(usePollStore.getState().snapshot).not.toHaveProperty("mine")

    usePollStore.getState().apply(null)

    expect(usePollStore.getState().snapshot).toBeNull()
  })

  it("takes the host's running count for the poll that is open", () => {
    usePollStore.getState().apply(open())

    usePollStore
      .getState()
      .applyTally({ pollId: "lunch", counts: [2, 1], total: 3 })

    expect(usePollStore.getState().snapshot).toMatchObject({
      counts: [2, 1],
      total: 3,
    })
  })

  it("shows voters only while the tally carries them", () => {
    usePollStore.getState().apply(open({ anonymous: false }))

    usePollStore.getState().applyTally({
      pollId: "lunch",
      counts: [1, 0],
      total: 1,
      voters: [{ username: "Alice", option: 0 }],
    })

    expect(usePollStore.getState().snapshot?.voters).toEqual([
      { username: "Alice", option: 0 },
    ])

    usePollStore
      .getState()
      .applyTally({ pollId: "lunch", counts: [0, 0], total: 0 })

    expect(usePollStore.getState().snapshot).not.toHaveProperty("voters")
  })

  it("ignores a count that is late, for another poll, or with nothing showing", () => {
    usePollStore.getState().applyTally({ pollId: "x", counts: [1], total: 1 })
    expect(usePollStore.getState().snapshot).toBeNull()

    usePollStore.getState().apply(open({ phase: "closed", counts: [3, 1] }))
    usePollStore
      .getState()
      .applyTally({ pollId: "lunch", counts: [9, 9], total: 18 })
    expect(usePollStore.getState().snapshot?.counts).toEqual([3, 1])

    usePollStore.getState().apply(open())
    usePollStore
      .getState()
      .applyTally({ pollId: "other", counts: [5, 5], total: 10 })
    expect(usePollStore.getState().snapshot?.counts).toEqual([0, 0])
  })

  it("sets a player's own pick, and does nothing with no poll", () => {
    usePollStore.getState().setMine(1)
    expect(usePollStore.getState().snapshot).toBeNull()

    usePollStore.getState().apply(open({ mine: null }))
    usePollStore.getState().setMine(1)

    expect(usePollStore.getState().snapshot?.mine).toBe(1)

    usePollStore.getState().setMine(null)

    expect(usePollStore.getState().snapshot?.mine).toBeNull()
  })
})
