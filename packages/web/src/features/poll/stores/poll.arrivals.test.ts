import type { PollSnapshot } from "@razzia/common/types/poll"
import {
  ARRIVALS_KEPT,
  usePollStore,
} from "@razzia/web/features/poll/stores/poll"
import { beforeEach, describe, expect, it } from "vitest"

// Each vote that raises the host's total is an arrival, named when the tally
// names it (a sealed poll's first vote). A snapshot never replays any.

const open = (extra: Partial<PollSnapshot> = {}): PollSnapshot => ({
  pollId: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous: true,
  phase: "open",
  total: 0,
  ...extra,
})

const store = () => usePollStore.getState()

describe("poll store arrivals", () => {
  beforeEach(() => {
    store().reset()
  })

  it("records each first vote with the name the tally carries", () => {
    store().apply(open())
    store().applyTally({ pollId: "lunch", total: 1, arrived: "Ada" })
    store().applyTally({ pollId: "lunch", total: 2, arrived: "Grace" })

    expect(store().arrivals).toEqual([
      { seq: 1, name: "Ada", total: 1 },
      { seq: 2, name: "Grace", total: 2 },
    ])
  })

  it("records a live poll's votes with no name", () => {
    store().apply(open({ counts: [0, 0], live: true }))
    store().applyTally({ pollId: "lunch", counts: [1, 0], total: 1 })

    expect(store().arrivals).toEqual([{ seq: 1, name: null, total: 1 }])
  })

  it("does not count a changed vote or a leaver as an arrival", () => {
    store().apply(open())
    store().applyTally({ pollId: "lunch", total: 1, arrived: "Ada" })
    store().applyTally({ pollId: "lunch", total: 1 })
    store().applyTally({ pollId: "lunch", total: 0 })

    expect(store().arrivals.map(({ name }) => name)).toEqual(["Ada"])
  })

  it("gives a jump one arrival per vote, naming only the last", () => {
    store().apply(open({ total: 1 }))
    store().applyTally({ pollId: "lunch", total: 3, arrived: "Linus" })

    expect(store().arrivals).toEqual([
      { seq: 1, name: null, total: 2 },
      { seq: 2, name: "Linus", total: 3 },
    ])
  })

  it("replays nothing from a snapshot, and keeps the arrivals through its own updates", () => {
    store().apply(open({ total: 5 }))

    expect(store().arrivals).toEqual([])

    store().applyTally({ pollId: "lunch", total: 6, arrived: "Ada" })
    store().apply(open({ total: 6 }))

    expect(store().arrivals).toHaveLength(1)
  })

  it("starts over for another poll, and when the poll is gone", () => {
    store().apply(open())
    store().applyTally({ pollId: "lunch", total: 1, arrived: "Ada" })
    store().apply(open({ pollId: "dinner" }))

    expect(store().arrivals).toEqual([])

    store().applyTally({ pollId: "dinner", total: 1, arrived: "Grace" })
    store().apply(null)

    expect(store().arrivals).toEqual([])
  })

  it("ignores a tally for another poll", () => {
    store().apply(open())
    store().applyTally({ pollId: "old", total: 4, arrived: "Ada" })

    expect(store().arrivals).toEqual([])
  })

  it("keeps a bounded number, still counting on", () => {
    store().apply(open())

    for (let total = 1; total <= ARRIVALS_KEPT + 5; total += 1) {
      store().applyTally({ pollId: "lunch", total, arrived: `P${total}` })
    }

    expect(store().arrivals).toHaveLength(ARRIVALS_KEPT)
    expect(store().arrivals.at(-1)).toEqual({
      seq: ARRIVALS_KEPT + 5,
      name: `P${ARRIVALS_KEPT + 5}`,
      total: ARRIVALS_KEPT + 5,
    })
  })
})
