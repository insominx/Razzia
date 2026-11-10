import type { PollDone, PollSnapshot } from "@razzia/common/types/poll"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import HostPollOverlay from "@razzia/web/features/poll/components/HostPollOverlay"
import PollBars from "@razzia/web/features/poll/components/PollBars"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A deck going back to a poll that has closed: the host's screen in its frame
// shows that result again as it was left, with no reveal and no button.

const mocks = vi.hoisted(() => ({ embed: true }))

vi.mock("@razzia/web/features/deck/embed", () => ({
  get IS_DECK_EMBED() {
    return mocks.embed
  },
}))

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

const done = (extra: Partial<PollDone> = {}): PollDone => ({
  id: "role-clarity",
  question: "How clear is your role?",
  options: ["Clear", "Mostly", "Not yet"],
  anonymous: true,
  live: false,
  counts: [3, 1, 0],
  total: 4,
  ...extra,
})

const live: PollSnapshot = {
  pollId: "shared-vision",
  question: "Do you share a vision?",
  options: ["Yes", "No"],
  anonymous: true,
  phase: "open",
  total: 2,
}

const review = (entry: PollDone | null) => {
  act(() => {
    usePollStore.getState().setReview(entry)
  })
}

const ANIMATED = ".rz-count-up, .animate-rz-bar-grow, .animate-rz-fade-in"

describe("a closed poll's result shown again in a deck's frame", () => {
  beforeEach(() => {
    mocks.embed = true
    usePollStore.getState().reset()
    useManagerStore.getState().reset()
    useManagerStore.setState({ gameId: "g1", hostControls: false })
  })

  afterEach(cleanup)

  it("shows the wording it closed with and its final counts", () => {
    render(<HostPollOverlay />)
    review(done())

    const dialog = screen.getByRole("dialog")

    expect(dialog.textContent).toContain("How clear is your role?")
    expect(dialog.textContent).toContain("Not yet")
    expect(dialog.textContent).toContain("poll:host.closedNote")
    expect(
      [...dialog.querySelectorAll("[data-poll-count] .sr-only")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["3", "1", "0"])
  })

  it("plays no reveal: no tick-up, no growing bar, no fade", () => {
    render(<HostPollOverlay />)
    review(done())

    expect(screen.getByRole("dialog").matches(ANIMATED)).toBe(false)
    expect(screen.getByRole("dialog").querySelectorAll(ANIMATED)).toHaveLength(
      0,
    )
  })

  it("says nobody voted at zero, with no connected count", () => {
    render(<HostPollOverlay />)
    review(done({ counts: [0, 0, 0], total: 0 }))

    const voted = screen.getByRole("dialog").querySelector("[data-poll-voted]")

    expect(voted?.textContent).toBe("poll:noOneVoted")
  })

  it("covers a poll on the stage, and the stage comes back when it ends", () => {
    render(<HostPollOverlay />)
    act(() => {
      usePollStore.getState().apply(live)
    })
    review(done())

    expect(screen.getByRole("dialog").textContent).toContain(
      "How clear is your role?",
    )

    review(null)

    expect(screen.getByRole("dialog").textContent).toContain(
      "Do you share a vision?",
    )
  })

  it("offers no Close or Done, even with Razzia's own controls up", () => {
    render(<HostPollOverlay />)
    act(() => {
      useManagerStore.getState().setHostControls(true)
    })
    review(done())

    expect(screen.queryByRole("button")).toBeNull()
  })

  it("is never drawn outside a deck's frame", () => {
    mocks.embed = false
    render(<HostPollOverlay />)
    review(done())

    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("PollBars settled", () => {
  afterEach(cleanup)

  it("draws final widths and numbers with no reveal", () => {
    const { container } = render(
      <PollBars options={["A", "B"]} counts={[3, 1]} total={4} settled />,
    )

    expect(container.querySelectorAll(ANIMATED)).toHaveLength(0)
    expect(
      [...container.querySelectorAll<HTMLElement>("[aria-hidden] > div")].map(
        (bar) => bar.style.width,
      ),
    ).toEqual(["75%", "25%"])
    expect(container.textContent).toContain("75%")
  })

  it("still reveals when not settled", () => {
    const { container } = render(
      <PollBars options={["A", "B"]} counts={[3, 1]} total={4} />,
    )

    expect(container.querySelectorAll(ANIMATED).length).toBeGreaterThan(0)
  })
})
