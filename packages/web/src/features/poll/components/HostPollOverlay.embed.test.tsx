import type { PollSnapshot } from "@razzia/common/types/poll"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import HostPollOverlay from "@razzia/web/features/poll/components/HostPollOverlay"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// In a deck's frame this screen is the projector: no names, no stray buttons,
// and keys that still reach the deck.

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

const named = (extra: Partial<PollSnapshot> = {}): PollSnapshot => ({
  pollId: "path-pick",
  question: "Who presents first?",
  options: ["Full game", "Minigame"],
  anonymous: false,
  phase: "closed",
  counts: [1, 1],
  total: 2,
  voters: [
    { username: "Alice", option: 0 },
    { username: "Bobby", option: 1 },
  ],
  ...extra,
})

const show = (snapshot: PollSnapshot) => {
  act(() => {
    usePollStore.getState().apply(snapshot)
  })
}

const hostControls = (shown: boolean) => {
  act(() => {
    useManagerStore.getState().setHostControls(shown)
  })
}

describe("HostPollOverlay in a deck's frame", () => {
  beforeEach(() => {
    mocks.embed = true
    usePollStore.getState().reset()
    useManagerStore.getState().reset()
    useManagerStore.setState({ gameId: "g1", hostControls: false })
  })

  afterEach(cleanup)

  it("draws no voter name, even for a named poll that has closed", () => {
    render(<HostPollOverlay />)
    show(named())

    const dialog = screen.getByRole("dialog")

    expect(dialog.querySelector("[data-poll-names]")).toBeNull()
    expect(dialog.textContent).not.toContain("Alice")
    expect(dialog.textContent).not.toContain("Bobby")
    // It says where the names are, not that the host sees them here.
    expect(dialog.textContent).toContain("poll:privacy.namedStage")
    expect(dialog.textContent).not.toMatch(/poll:privacy\.named(?!Stage)/u)
  })

  it("draws no voter name while a named poll is open and live", () => {
    render(<HostPollOverlay />)
    show(named({ phase: "open", live: true }))

    expect(
      screen.getByRole("dialog").querySelector("[data-poll-names]"),
    ).toBeNull()
  })

  it("shows no Close or Done button until the presenter asks for Razzia's controls", () => {
    render(<HostPollOverlay />)
    show(named({ phase: "open", counts: undefined, voters: undefined }))

    expect(screen.queryByRole("button")).toBeNull()

    hostControls(true)
    expect(
      screen.getByRole("button", { name: "poll:host.close" }),
    ).toBeInTheDocument()

    show(named())
    expect(
      screen.getByRole("button", { name: "poll:host.done" }),
    ).toBeInTheDocument()

    hostControls(false)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("hands its keys back to the deck, and is the frame the page can make clear", () => {
    render(<HostPollOverlay />)
    show(named())

    const dialog = screen.getByRole("dialog")

    expect(dialog).toHaveAttribute("data-deck-keys")
    expect(dialog).toHaveAttribute("data-poll-frame")
  })

  it("is unchanged outside a deck: names and buttons show, and it keeps its keys", () => {
    mocks.embed = false
    useManagerStore.setState({ hostControls: true })
    render(<HostPollOverlay />)
    show(named())

    const dialog = screen.getByRole("dialog")

    expect(dialog.querySelectorAll("[data-poll-names]")).toHaveLength(2)
    expect(dialog.textContent).toMatch(/poll:privacy\.named(?!Stage)/u)
    expect(dialog).not.toHaveAttribute("data-deck-keys")
    expect(
      screen.getByRole("button", { name: "poll:host.done" }),
    ).toBeInTheDocument()
  })
})
