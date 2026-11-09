import { EVENTS } from "@razzia/common/constants"
import type { PollSnapshot } from "@razzia/common/types/poll"
import { usePollLane } from "@razzia/web/features/poll/hooks/use-poll-lane"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const emit = vi.fn()

  return {
    emit,
    // The real client socket is one object for the life of the page.
    socket: { emit },
    handlers: new Map<string, (_payload?: unknown) => void>(),
  }
})

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: mocks.socket }),
  useEvent: (event: string, handler: (_payload?: unknown) => void) => {
    mocks.handlers.set(event, handler)
  },
}))

const Probe = ({ gameId }: { gameId: string | null }) => {
  usePollLane(gameId)

  return null
}

const snapshot: PollSnapshot = {
  pollId: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous: true,
  phase: "open",
  counts: [0, 0],
  total: 0,
}

describe("usePollLane", () => {
  beforeEach(() => {
    mocks.emit.mockClear()
    mocks.handlers.clear()
    usePollStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
  })

  it("records the poll the server tells this screen about, and its clearing", () => {
    render(<Probe gameId={null} />)

    mocks.handlers.get(EVENTS.POLL.STATE)?.(snapshot)
    expect(usePollStore.getState().snapshot).toEqual(snapshot)

    mocks.handlers.get(EVENTS.POLL.STATE)?.(null)
    expect(usePollStore.getState().snapshot).toBeNull()
  })

  it("records the host's running count", () => {
    render(<Probe gameId={null} />)
    mocks.handlers.get(EVENTS.POLL.STATE)?.(snapshot)

    mocks.handlers.get(EVENTS.POLL.TALLY)?.({
      pollId: "lunch",
      counts: [2, 1],
      total: 3,
    })

    expect(usePollStore.getState().snapshot).toMatchObject({
      counts: [2, 1],
      total: 3,
    })
  })

  it("asks where the poll stands as soon as it has a game", () => {
    const { rerender } = render(<Probe gameId={null} />)

    expect(mocks.emit).not.toHaveBeenCalled()

    rerender(<Probe gameId="g1" />)

    expect(mocks.emit).toHaveBeenCalledTimes(1)
    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.POLL.SYNC, { gameId: "g1" })
  })

  it("asks again when the game it is in changes, and not on every render", () => {
    const { rerender } = render(<Probe gameId="g1" />)
    rerender(<Probe gameId="g1" />)

    expect(mocks.emit).toHaveBeenCalledTimes(1)

    rerender(<Probe gameId="g2" />)

    expect(mocks.emit).toHaveBeenLastCalledWith(EVENTS.POLL.SYNC, {
      gameId: "g2",
    })
    expect(mocks.emit).toHaveBeenCalledTimes(2)
  })
})
