import type { PollSnapshot } from "@razzia/common/types/poll"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import HostPollOverlay from "@razzia/web/features/poll/components/HostPollOverlay"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() }, isConnected: true }),
  useEvent: vi.fn(),
}))

vi.mock("@razzia/web/components/Atmosphere", () => ({ default: () => null }))

vi.mock("@razzia/web/features/game/hooks/use-show-intensity", () => ({
  useCalmVisuals: () => false,
}))

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

// What the server sends the host for a sealed poll that is open: the words
// and how many have voted, with no counts and no names.
const sealedOpen = (extra: Partial<PollSnapshot> = {}): PollSnapshot => ({
  pollId: "lunch",
  question: "What should we eat?",
  options: ["Pizza", "Soup"],
  anonymous: false,
  phase: "open",
  total: 2,
  ...extra,
})

const show = (snapshot: PollSnapshot | null) => {
  act(() => {
    usePollStore.getState().apply(snapshot)
  })
}

const counts = () => document.querySelectorAll("[data-poll-count]")

describe("HostPollOverlay with a sealed poll", () => {
  beforeEach(() => {
    usePollStore.getState().reset()
    useManagerStore.getState().reset()
    useManagerStore.setState({
      gameId: "g1",
      players: [{ id: "a" }, { id: "b" }, { id: "c" }] as never,
    })
  })

  afterEach(cleanup)

  it("shows the options, how many have voted and that results wait for the close", () => {
    render(<HostPollOverlay />)
    show(sealedOpen())

    expect(screen.getByText("Pizza")).toBeVisible()
    expect(screen.getByText("Soup")).toBeVisible()
    expect(screen.getByText('poll:voted:{"voted":2,"total":3}')).toBeVisible()
    expect(screen.getByText("poll:host.sealedNote")).toBeVisible()
    expect(counts()).toHaveLength(0)
    expect(document.querySelector("[data-poll-names]")).toBeNull()
  })

  it("takes the room total from the room's own count, not the lobby list", () => {
    render(<HostPollOverlay />)
    show(sealedOpen({ total: 4 }))

    // A student joined between questions: the lobby list still holds three.
    act(() => {
      usePollStore.getState().setPlayerTotal(5)
    })

    expect(screen.getByText('poll:voted:{"voted":4,"total":5}')).toBeVisible()
  })

  it("follows the tally as it grows, still without counts", () => {
    render(<HostPollOverlay />)
    show(sealedOpen({ total: 0 }))

    act(() => {
      usePollStore.getState().applyTally({ pollId: "lunch", total: 3 })
    })

    expect(screen.getByText('poll:voted:{"voted":3,"total":3}')).toBeVisible()
    expect(counts()).toHaveLength(0)
  })

  it("draws the bars once the server sends the result at the close", () => {
    render(<HostPollOverlay />)
    show(sealedOpen())
    show(
      sealedOpen({
        phase: "closed",
        counts: [2, 0],
        total: 2,
        voters: [
          { username: "Alice", option: 0 },
          { username: "Bobby", option: 0 },
        ],
      }),
    )

    expect([...counts()].map((count) => count.textContent)).toEqual([
      "2100%",
      "00%",
    ])
    expect(screen.queryByText("poll:host.sealedNote")).toBeNull()
  })

  it("keeps drawing a live poll's bars while it is open", () => {
    render(<HostPollOverlay />)
    show(sealedOpen({ counts: [1, 1], total: 2, live: true }))

    expect(counts()).toHaveLength(2)
    expect(screen.queryByText("poll:host.sealedNote")).toBeNull()
  })

  it("says nobody voted when a sealed poll closes empty", () => {
    render(<HostPollOverlay />)
    show(sealedOpen({ phase: "closed", counts: [0, 0], total: 0 }))

    expect(screen.getByText("poll:noOneVoted")).toBeVisible()
  })
})
