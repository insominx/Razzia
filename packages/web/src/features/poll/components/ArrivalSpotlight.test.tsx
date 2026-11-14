import type { PollSnapshot } from "@razzia/common/types/poll"
import ArrivalSpotlight, {
  ARRIVAL_FAST_MS,
  ARRIVAL_HOLD_MS,
} from "@razzia/web/features/poll/components/ArrivalSpotlight"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ cue: vi.fn(), calm: false }))

vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: { cue: mocks.cue },
}))

vi.mock("@razzia/web/features/game/hooks/use-show-intensity", () => ({
  useCalmVisuals: () => mocks.calm,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const sealed: PollSnapshot = {
  pollId: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous: true,
  phase: "open",
  total: 0,
}

let total = 0

const arrive = (name?: string) => {
  total += 1
  act(() => {
    usePollStore.getState().applyTally({
      pollId: "lunch",
      total,
      ...(name ? { arrived: name } : {}),
    })
  })
}

const wait = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

// What holds the spotlight now: the one name not on its way out.
const current = () =>
  document.querySelector("[data-arrival]:not([data-leaving])")?.textContent ??
  null

const trail = () =>
  [...document.querySelectorAll("[data-poll-trail] > span")].map(
    (span) => span.textContent,
  )

describe("ArrivalSpotlight", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.cue.mockClear()
    mocks.calm = false
    total = 0
    usePollStore.getState().reset()
    usePollStore.getState().apply(sealed)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("shows each voter's name as they vote, and rings a step higher each time", () => {
    render(<ArrivalSpotlight allIn={false} room={4} />)

    arrive("Ada")
    expect(current()).toBe("Ada")
    expect(mocks.cue).toHaveBeenLastCalledWith({ cue: "vote", share: 0.25 })

    wait(ARRIVAL_HOLD_MS)
    arrive("Grace")
    expect(current()).toBe("Grace")
    expect(mocks.cue).toHaveBeenLastCalledWith({ cue: "vote", share: 0.5 })
    expect(trail()).toEqual(["Ada"])
  })

  it("holds each name a beat before the next, so a quick pair is not lost", () => {
    render(<ArrivalSpotlight allIn={false} room={10} />)

    arrive("Ada")
    arrive("Grace")
    expect(current()).toBe("Ada")

    wait(ARRIVAL_HOLD_MS)
    expect(current()).toBe("Grace")
    expect(trail()).toEqual(["Ada"])
  })

  it("folds a burst into one name and +N, putting the rest on the trail", () => {
    render(<ArrivalSpotlight allIn={false} room={30} />)

    arrive("Ada")
    for (const name of ["Grace", "Linus", "Barbara", "Ken"]) {
      arrive(name)
    }

    wait(ARRIVAL_HOLD_MS)

    expect(current()).toBe('Gracepoll:arrival.more:{"count":3}')
    expect(trail()).toEqual(["Ken", "Barbara", "Linus", "Ada"])
    // One note for the burst, pitched for where the room now stands.
    expect(mocks.cue).toHaveBeenCalledTimes(2)
    expect(mocks.cue).toHaveBeenLastCalledWith({ cue: "vote", share: 5 / 30 })
  })

  it("shows a nameless arrival as a vote and leaves no trail (a live poll)", () => {
    render(<ArrivalSpotlight allIn={false} room={4} />)

    arrive()
    expect(current()).toBe("poll:arrival.someone")

    wait(ARRIVAL_HOLD_MS)
    arrive()
    expect(trail()).toEqual([])
  })

  it("says everyone is in once the last name has had its moment", () => {
    const { rerender } = render(<ArrivalSpotlight allIn={false} room={2} />)

    arrive("Ada")
    wait(ARRIVAL_HOLD_MS)
    arrive("Grace")
    rerender(<ArrivalSpotlight allIn room={2} />)

    expect(current()).toBe("Grace")

    wait(ARRIVAL_HOLD_MS)

    expect(current()).toBe("poll:arrival.everyone")
    expect(document.querySelector('[data-arrival="all"]')).not.toBeNull()
    expect(trail()).toEqual(["Grace", "Ada"])
    // No closing burst: the last sound is the last vote.
    expect(mocks.cue).toHaveBeenCalledTimes(2)
  })

  it("takes 'everyone is in' back when someone new joins", () => {
    const { rerender } = render(<ArrivalSpotlight allIn room={1} />)

    expect(current()).toBe("poll:arrival.everyone")

    rerender(<ArrivalSpotlight allIn={false} room={2} />)

    expect(current()).toBeNull()
  })

  it("does not replay the arrivals that came before it appeared", () => {
    arrive("Ada")
    arrive("Grace")

    render(<ArrivalSpotlight allIn={false} room={4} />)

    expect(current()).toBeNull()
    expect(mocks.cue).not.toHaveBeenCalled()
  })

  it("moves a short backlog along faster than a single name", () => {
    render(<ArrivalSpotlight allIn={false} room={40} />)

    arrive("A")
    arrive("B")
    arrive("C")
    // Two waiting, short of a fold: once B is up, C follows at the faster pace.
    wait(ARRIVAL_HOLD_MS)
    expect(current()).toBe("B")

    wait(ARRIVAL_FAST_MS)
    expect(current()).toBe("C")
  })

  it("lets the old name step out, or swaps at once in calm", () => {
    render(<ArrivalSpotlight allIn={false} room={4} />)

    arrive("Ada")
    wait(ARRIVAL_HOLD_MS)
    arrive("Grace")

    expect(document.querySelectorAll("[data-leaving]")).toHaveLength(1)

    wait(500)
    expect(document.querySelectorAll("[data-leaving]")).toHaveLength(0)

    cleanup()
    mocks.calm = true
    render(<ArrivalSpotlight allIn={false} room={4} />)
    arrive("Linus")
    wait(ARRIVAL_HOLD_MS)
    arrive("Ken")

    expect(document.querySelectorAll("[data-leaving]")).toHaveLength(0)
    expect(document.querySelector("[data-arrival]")).toHaveAttribute(
      "data-calm",
    )
  })
})
