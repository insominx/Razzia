import { EVENTS } from "@razzia/common/constants"
import type { PollSnapshot } from "@razzia/common/types/poll"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import PlayerPollOverlay from "@razzia/web/features/poll/components/PlayerPollOverlay"
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
  options: ["Pizza", "Soup", "Salad"],
  anonymous: true,
  phase: "open",
  mine: null,
  ...extra,
})

const show = (snapshot: PollSnapshot | null) => {
  act(() => {
    usePollStore.getState().apply(snapshot)
  })
}

const choice = (index: number) =>
  document.querySelector<HTMLButtonElement>(`[data-poll-choice="${index}"]`)

const choiceButton = (index: number) => {
  const element = choice(index)

  if (!element) {
    throw new Error(`There is no choice ${index} on screen.`)
  }

  return element
}

// A tap, and the microtask in which the server's answer is acted on.
const tap = async (element: Element) => {
  await act(async () => {
    fireEvent.click(element)
    await Promise.resolve()
  })
}

// The server answers every vote at once with this outcome.
const answerWith = (outcome: string) => {
  mocks.emit.mockImplementation(
    (event: string, _payload: unknown, ack?: Ack) => {
      if (event === EVENTS.POLL.VOTE) {
        ack?.(outcome)
      }
    },
  )
}

const syncs = () =>
  mocks.emit.mock.calls.filter(([event]) => event === EVENTS.POLL.SYNC)

describe("PlayerPollOverlay", () => {
  beforeEach(() => {
    mocks.emit.mockReset()
    mocks.toastError.mockReset()
    usePollStore.getState().reset()
    usePlayerStore.getState().reset()
    usePlayerStore.setState({ gameId: "g1" })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("shows nothing while no poll is showing", () => {
    const { container } = render(<PlayerPollOverlay />)

    expect(container).toBeEmptyDOMElement()
  })

  it("shows the question and its options as a dialog, and says votes can change", () => {
    render(<PlayerPollOverlay />)
    show(open())

    const dialog = screen.getByRole("dialog")

    expect(dialog).toHaveAccessibleName("What should we eat?")
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(choice(0)).toHaveTextContent("Pizza")
    expect(choice(2)).toHaveTextContent("Salad")
    expect(screen.getByText("poll:changeHint")).toBeInTheDocument()
  })

  it("tells the student whether their vote is anonymous or seen by the host", () => {
    render(<PlayerPollOverlay />)
    show(open({ anonymous: true }))
    expect(screen.getByText("poll:privacy.anonymous")).toBeInTheDocument()

    show(open({ anonymous: false }))
    expect(screen.getByText("poll:privacy.named")).toBeInTheDocument()
  })

  it("sends the vote on the tap and shows it at once, before the server answers", () => {
    render(<PlayerPollOverlay />)
    show(open())

    fireEvent.click(choiceButton(1))

    expect(mocks.emit).toHaveBeenCalledWith(
      EVENTS.POLL.VOTE,
      { gameId: "g1", pollId: "lunch", option: 1 },
      expect.any(Function),
    )
    expect(choice(1)).toHaveAttribute("aria-pressed", "true")
    expect(usePollStore.getState().snapshot?.mine).toBe(1)
  })

  it("lets the student change their vote, and does not resend the same one", async () => {
    answerWith("accepted")
    render(<PlayerPollOverlay />)
    show(open())

    await tap(choiceButton(0))
    await tap(choiceButton(0))
    await tap(choiceButton(2))

    const votes = mocks.emit.mock.calls
      .filter(([event]) => event === EVENTS.POLL.VOTE)
      .map(([, payload]) => (payload as { option: number }).option)

    expect(votes).toEqual([0, 2])
    expect(choice(0)).toHaveAttribute("aria-pressed", "false")
    expect(choice(2)).toHaveAttribute("aria-pressed", "true")
  })

  it("puts the pick back, says why and asks the server what it holds, when a vote is refused", async () => {
    answerWith("tooManyChanges")
    render(<PlayerPollOverlay />)
    show(open({ mine: 0 }))

    await tap(choiceButton(1))

    expect(usePollStore.getState().snapshot?.mine).toBe(0)
    expect(mocks.toastError).toHaveBeenCalledWith(
      "poll:vote.tooManyChanges",
      expect.anything(),
    )
    expect(syncs()).toEqual([[EVENTS.POLL.SYNC, { gameId: "g1" }]])
  })

  it("does not blame the student when the poll closed under their tap", async () => {
    answerWith("closed")
    render(<PlayerPollOverlay />)
    show(open())

    await tap(choiceButton(1))

    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(syncs()).toHaveLength(1)
  })

  it("does not undo a newer tap when an older vote is refused", async () => {
    const acks: Ack[] = []

    mocks.emit.mockImplementation(
      (event: string, _payload: unknown, ack?: Ack) => {
        if (event === EVENTS.POLL.VOTE && ack) {
          acks.push(ack)
        }
      },
    )
    render(<PlayerPollOverlay />)
    show(open({ mine: 0 }))

    fireEvent.click(choiceButton(1))
    fireEvent.click(choiceButton(2))
    await act(async () => {
      acks[0]("invalid")
      await Promise.resolve()
    })

    expect(usePollStore.getState().snapshot?.mine).toBe(2)
  })

  it("gives up on a vote the server never answers, and asks what it holds", async () => {
    vi.useFakeTimers()
    render(<PlayerPollOverlay />)
    show(open({ mine: null }))

    fireEvent.click(choiceButton(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS)
    })

    expect(usePollStore.getState().snapshot?.mine).toBeNull()
    expect(mocks.toastError).toHaveBeenCalledWith(
      "poll:vote.failed",
      expect.anything(),
    )
    expect(syncs()).toHaveLength(1)
  })

  it("shows the result when the poll closes, with the student's own pick, and no more taps", () => {
    render(<PlayerPollOverlay />)
    show(
      open({
        phase: "closed",
        mine: 2,
        counts: [3, 1, 4],
        total: 8,
      }),
    )

    expect(choice(0)).toBeNull()
    expect(screen.getByText("poll:closedTitle")).toBeInTheDocument()
    expect(screen.getByText("poll:waitingForHost")).toBeInTheDocument()
    expect(
      [...document.querySelectorAll("[data-poll-count]")].map(
        (count) => count.textContent,
      ),
    ).toEqual(["338%", "113%", "450%"])
    expect(
      document.querySelector("[data-mine]")?.getAttribute("data-poll-option"),
    ).toBe("2")
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  it("goes away when the host dismisses the result", () => {
    render(<PlayerPollOverlay />)
    show(open({ phase: "closed", counts: [0, 0, 0], total: 0 }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    show(null)

    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("takes the focus when it opens", () => {
    render(<PlayerPollOverlay />)
    show(open())

    expect(screen.getByRole("dialog")).toHaveFocus()
  })
})
