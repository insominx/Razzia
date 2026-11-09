import type { PollSnapshot } from "@razzia/common/types/poll"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import PollShell from "@razzia/web/features/poll/components/PollShell"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// In a deck's frame the poll's screen is clear, so the quiz screen under it
// (the lobby: PIN, QR code, every player's name) must not show through.

const mocks = vi.hoisted(() => ({ embed: true }))

vi.mock("@razzia/web/features/deck/embed", () => ({
  get IS_DECK_EMBED() {
    return mocks.embed
  },
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() } }),
  useEvent: vi.fn(),
}))

vi.mock("@razzia/web/features/poll/components/PlayerPollOverlay", () => ({
  default: () => <p>player overlay</p>,
}))

vi.mock("@razzia/web/features/poll/components/HostPollOverlay", () => ({
  default: () => <p>host overlay</p>,
}))

vi.mock("@razzia/web/features/poll/components/HostPollLauncher", () => ({
  default: () => <p>host launcher</p>,
}))

const snapshot: PollSnapshot = {
  pollId: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous: true,
  phase: "open",
}

const show = (value: PollSnapshot | null) => {
  act(() => {
    usePollStore.getState().apply(value)
  })
}

const wrapperOf = (container: HTMLElement) =>
  container.firstElementChild as HTMLElement

describe("PollShell in a deck's frame", () => {
  beforeEach(() => {
    mocks.embed = true
    usePollStore.getState().reset()
    usePlayerStore.getState().reset()
    useManagerStore.getState().reset()
  })

  afterEach(cleanup)

  it("hides the quiz screen while a poll shows, and keeps it mounted and inert", () => {
    const { container } = render(
      <PollShell role="host">
        <p>the lobby: PIN 123456, Alice, Bobby</p>
      </PollShell>,
    )

    expect(wrapperOf(container)).not.toHaveClass("invisible")

    show(snapshot)

    expect(wrapperOf(container)).toHaveClass("contents", "invisible")
    expect(wrapperOf(container)).toHaveAttribute("inert")
    expect(wrapperOf(container)).toHaveAttribute("data-poll-hides-quiz")
    // Mounted, so the quiz's own state is untouched.
    expect(screen.getByText(/the lobby/u)).toBeInTheDocument()
  })

  it("shows the quiz screen again the moment the poll is gone", () => {
    const { container } = render(
      <PollShell role="host">
        <p>the lobby</p>
      </PollShell>,
    )

    show(snapshot)
    show(null)

    expect(wrapperOf(container)).not.toHaveClass("invisible")
    expect(wrapperOf(container)).not.toHaveAttribute("inert")
    expect(wrapperOf(container)).not.toHaveAttribute("data-poll-hides-quiz")
  })

  it("leaves a page outside a deck as it was: inert under the poll, not hidden", () => {
    mocks.embed = false
    const { container } = render(
      <PollShell role="host">
        <p>the lobby</p>
      </PollShell>,
    )

    show(snapshot)

    expect(wrapperOf(container)).toHaveAttribute("inert")
    expect(wrapperOf(container)).not.toHaveClass("invisible")
  })

  it("hides it on a phone's page only inside a deck, which a phone never is", () => {
    mocks.embed = false
    const { container } = render(
      <PollShell role="player">
        <p>the game</p>
      </PollShell>,
    )

    show(snapshot)

    expect(wrapperOf(container)).not.toHaveClass("invisible")
  })
})
