import { EVENTS } from "@razzia/common/constants"
import type { PollSnapshot } from "@razzia/common/types/poll"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import PollShell from "@razzia/web/features/poll/components/PollShell"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ emit: vi.fn() }))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit } }),
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

const lecture = {
  inviteCode: "123456",
  total: 2,
  played: [],
  current: null,
  finished: false,
}

describe("PollShell", () => {
  beforeEach(() => {
    mocks.emit.mockClear()
    usePollStore.getState().reset()
    usePlayerStore.getState().reset()
    useManagerStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
  })

  it("keeps the game's own screens as they were while no poll is showing", () => {
    const { container } = render(
      <PollShell role="player">
        <p>the quiz</p>
      </PollShell>,
    )

    expect(screen.getByText("the quiz")).toBeVisible()
    expect(container.querySelector("[inert]")).toBeNull()
  })

  it("makes the game's screens inert, but keeps them mounted, while a poll shows", () => {
    const { container } = render(
      <PollShell role="player">
        <p>the quiz</p>
      </PollShell>,
    )

    act(() => {
      usePollStore.getState().apply(snapshot)
    })

    const inert = container.querySelector("[inert]")

    expect(inert).toHaveTextContent("the quiz")
    // The overlay is beside the inert part, not inside it.
    expect(inert).not.toHaveTextContent("player overlay")
    expect(screen.getByText("player overlay")).toBeInTheDocument()

    act(() => {
      usePollStore.getState().apply(null)
    })

    expect(container.querySelector("[inert]")).toBeNull()
    expect(screen.getByText("the quiz")).toBeInTheDocument()
  })

  it("gives a player the player's overlay, and a host the host's overlay and launcher", () => {
    const { unmount } = render(
      <PollShell role="player">
        <p>x</p>
      </PollShell>,
    )

    expect(screen.getByText("player overlay")).toBeInTheDocument()
    expect(screen.queryByText("host overlay")).toBeNull()
    expect(screen.queryByText("host launcher")).toBeNull()
    unmount()

    render(
      <PollShell role="host">
        <p>x</p>
      </PollShell>,
    )

    expect(screen.getByText("host overlay")).toBeInTheDocument()
    expect(screen.getByText("host launcher")).toBeInTheDocument()
    expect(screen.queryByText("player overlay")).toBeNull()
  })

  it("makes a player's page ask where the poll stands once it knows its game", () => {
    usePlayerStore.setState({ gameId: "g1" })

    render(
      <PollShell role="player">
        <p>x</p>
      </PollShell>,
    )

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.POLL.SYNC, { gameId: "g1" })
  })

  it("makes a host's page ask only in a lecture room", () => {
    useManagerStore.setState({ gameId: "g2", lecture: null })
    const { unmount } = render(
      <PollShell role="host">
        <p>x</p>
      </PollShell>,
    )

    expect(mocks.emit).not.toHaveBeenCalled()
    unmount()

    useManagerStore.setState({ gameId: "g2", lecture })
    render(
      <PollShell role="host">
        <p>x</p>
      </PollShell>,
    )

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.POLL.SYNC, { gameId: "g2" })
  })
})
