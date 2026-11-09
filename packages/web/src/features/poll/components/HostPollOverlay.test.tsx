import { EVENTS } from "@razzia/common/constants"
import type { PollSnapshot } from "@razzia/common/types/poll"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import HostPollOverlay from "@razzia/web/features/poll/components/HostPollOverlay"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { ACK_TIMEOUT_MS } from "@razzia/web/features/poll/utils/emit-with-ack"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit }, isConnected: true }),
  useEvent: vi.fn(),
}))

vi.mock("@razzia/web/components/Atmosphere", () => ({ default: () => null }))

vi.mock("@razzia/web/features/game/hooks/use-show-intensity", () => ({
  useCalmVisuals: () => false,
}))

vi.mock("react-hot-toast", () => ({
  default: { error: mocks.toastError },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

type Ack = (_outcome: string) => void

const open = (extra: Partial<PollSnapshot> = {}): PollSnapshot => ({
  pollId: "lunch",
  question: "What should we eat?",
  options: ["Pizza", "Soup"],
  anonymous: true,
  phase: "open",
  counts: [0, 0],
  total: 0,
  ...extra,
})

const show = (snapshot: PollSnapshot | null) => {
  act(() => {
    usePollStore.getState().apply(snapshot)
  })
}

const closeButton = () =>
  screen.getByRole("button", { name: "poll:host.close" })

// A click, and the microtask in which the server's answer is acted on.
const tap = async (element: Element) => {
  await act(async () => {
    fireEvent.click(element)
    await Promise.resolve()
  })
}

const answerWith = (outcome: string) => {
  mocks.emit.mockImplementation(
    (event: string, _payload: unknown, ack?: Ack) => {
      if (
        event === EVENTS.MANAGER.CLOSE_POLL ||
        event === EVENTS.MANAGER.DISMISS_POLL
      ) {
        ack?.(outcome)
      }
    },
  )
}

describe("HostPollOverlay", () => {
  beforeEach(() => {
    mocks.emit.mockReset()
    mocks.toastError.mockReset()
    usePollStore.getState().reset()
    useManagerStore.getState().reset()
    useManagerStore.setState({
      gameId: "g1",
      players: [{ id: "a" }, { id: "b" }, { id: "c" }] as never,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("shows nothing while no poll is showing", () => {
    const { container } = render(<HostPollOverlay />)

    expect(container).toBeEmptyDOMElement()
  })

  it("shows the question, the votes so far and how many have voted", () => {
    render(<HostPollOverlay />)
    show(open({ counts: [2, 1], total: 3 }))

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "What should we eat?",
    )
    expect(
      [...document.querySelectorAll("[data-poll-count]")].map(
        (count) => count.textContent,
      ),
    ).toEqual(["267%", "133%"])
    expect(screen.getByText('poll:voted:{"voted":3,"total":3}')).toBeVisible()
  })

  it("counts out of everyone in the room", () => {
    render(<HostPollOverlay />)
    show(open({ counts: [1, 0], total: 1 }))

    expect(screen.getByText('poll:voted:{"voted":1,"total":3}')).toBeVisible()
  })

  it("says whether the poll is anonymous or names its voters", () => {
    render(<HostPollOverlay />)
    show(open({ anonymous: true }))
    expect(screen.getByText("poll:privacy.anonymous")).toBeInTheDocument()

    show(open({ anonymous: false }))
    expect(screen.getByText("poll:privacy.named")).toBeInTheDocument()
  })

  it("shows who voted for what only when the server sends names", () => {
    render(<HostPollOverlay />)
    show(
      open({
        anonymous: false,
        counts: [1, 0],
        total: 1,
        voters: [{ username: "Alice", option: 0 }],
      }),
    )

    expect(document.querySelector("[data-poll-names]")).toHaveTextContent(
      "Alice",
    )

    show(open({ anonymous: true, counts: [1, 0], total: 1 }))

    expect(document.querySelector("[data-poll-names]")).toBeNull()
  })

  it("closes the poll on the host's click, once, and waits for the room's own word", async () => {
    answerWith("accepted")
    render(<HostPollOverlay />)
    show(open())

    await tap(closeButton())

    expect(mocks.emit).toHaveBeenCalledTimes(1)
    expect(mocks.emit).toHaveBeenCalledWith(
      EVENTS.MANAGER.CLOSE_POLL,
      { gameId: "g1" },
      expect.any(Function),
    )
    // Accepted: no complaint, and the screen is not cleared by this click.
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("does not send a second click while the first is waiting", () => {
    render(<HostPollOverlay />)
    show(open())

    const close = closeButton()
    fireEvent.click(close)
    fireEvent.click(close)

    expect(mocks.emit).toHaveBeenCalledTimes(1)
    expect(close).toBeDisabled()
  })

  it("shows the result and a Done button once the poll has closed", async () => {
    answerWith("accepted")
    render(<HostPollOverlay />)
    show(open({ phase: "closed", counts: [3, 1], total: 4 }))

    expect(screen.getByText(/poll:host.closedNote/u)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "poll:host.close" })).toBeNull()

    await tap(screen.getByRole("button", { name: "poll:host.done" }))

    expect(mocks.emit).toHaveBeenCalledWith(
      EVENTS.MANAGER.DISMISS_POLL,
      { gameId: "g1" },
      expect.any(Function),
    )
  })

  it("says so when nobody voted", () => {
    render(<HostPollOverlay />)
    show(open({ phase: "closed", counts: [0, 0], total: 0 }))

    expect(screen.getByText("poll:noOneVoted")).toBeInTheDocument()
  })

  it("tells the host why a command was refused, unlocks, and asks what the room holds", async () => {
    answerWith("none")
    render(<HostPollOverlay />)
    show(open())

    await tap(closeButton())

    expect(mocks.toastError).toHaveBeenCalledWith(
      "poll:outcome.none",
      expect.anything(),
    )
    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.POLL.SYNC, { gameId: "g1" })
    expect(closeButton()).toBeEnabled()
  })

  it("unlocks and says so when the server never answers", async () => {
    vi.useFakeTimers()
    render(<HostPollOverlay />)
    show(open())

    fireEvent.click(closeButton())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS)
    })

    expect(mocks.toastError).toHaveBeenCalledWith(
      "poll:outcome.noAck",
      expect.anything(),
    )
    expect(closeButton()).toBeEnabled()
  })

  it("sends nothing without a game", () => {
    useManagerStore.setState({ gameId: null })
    render(<HostPollOverlay />)
    show(open())

    fireEvent.click(closeButton())

    expect(mocks.emit).not.toHaveBeenCalled()
  })
})
