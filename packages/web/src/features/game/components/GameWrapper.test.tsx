import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { EVENTS } from "@razzia/common/constants"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import { afterEach, describe, expect, it, vi } from "vitest"
import GameWrapper, {
  NEXT_RETRY_MS,
} from "@razzia/web/features/game/components/GameWrapper"
import { score } from "@razzia/web/features/game/audio/score"
import { useLaunchStore } from "@razzia/web/features/game/stores/launch"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"

vi.mock("@razzia/web/components/Atmosphere", () => ({
  default: () => null,
}))

vi.mock("@razzia/web/features/game/components/VolumeControl", () => ({
  default: () => null,
}))

const socket = vi.hoisted(() => ({ isConnected: true }))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useEvent: vi.fn(),
  useSocket: () => socket,
}))

vi.mock("@razzia/web/features/game/stores/player", () => ({
  usePlayerStore: () => ({ player: null }),
}))

vi.mock("@razzia/web/features/game/stores/question", () => {
  const state = {
    questionStates: { current: 7, total: 10 },
    setQuestionStates: vi.fn(),
  }

  return {
    useQuestionStore: (select?: (_state: typeof state) => unknown) =>
      select ? select(state) : state,
  }
})

vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: {
    configure: vi.fn(),
    start: vi.fn(),
    cue: vi.fn(),
    stop: vi.fn(),
    setRound: vi.fn(),
    dispose: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock("@razzia/web/features/game/hooks/use-show-intensity", () => ({
  useCalmVisuals: () => false,
  useShowIntensity: () => "full",
}))

vi.mock("@razzia/web/features/game/stores/sound", () => ({
  useSoundStore: {
    getState: () => ({ bindSurface: vi.fn() }),
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("GameWrapper reconnecting pill", () => {
  afterEach(() => {
    cleanup()
    socket.isConnected = true
  })

  it("says so while the socket is down and a game is on screen", () => {
    socket.isConnected = false
    render(
      <GameWrapper statusName={STATUS.SELECT_ANSWER}>
        <div>Answers</div>
      </GameWrapper>,
    )

    expect(screen.getByText("common:reconnecting")).toBeInTheDocument()
  })

  it("stays out of the way while connected", () => {
    render(
      <GameWrapper statusName={STATUS.SELECT_ANSWER}>
        <div>Answers</div>
      </GameWrapper>,
    )

    expect(screen.queryByText("common:reconnecting")).not.toBeInTheDocument()
  })

  it("does not cover the first connection, which has its own screen", () => {
    socket.isConnected = false
    render(
      <GameWrapper statusName={undefined}>
        <div>Answers</div>
      </GameWrapper>,
    )

    expect(screen.queryByText("common:reconnecting")).not.toBeInTheDocument()
  })
})

describe("GameWrapper launch", () => {
  afterEach(() => {
    cleanup()
    useLaunchStore.setState({ armed: false })
  })

  const renderAt = (statusName: Status) =>
    render(
      <GameWrapper statusName={statusName}>
        <div>Screen</div>
      </GameWrapper>,
    )

  it("keeps GO for the card that follows the countdown", () => {
    useLaunchStore.getState().arm()

    renderAt(STATUS.SHOW_START)
    cleanup()
    renderAt(STATUS.SHOW_PREPARED)

    expect(useLaunchStore.getState().armed).toBe(true)
  })

  it("drops a GO whose card was missed, so a later card cannot flash it", () => {
    // The countdown ran, then a reconnect landed past the first card.
    useLaunchStore.getState().arm()

    renderAt(STATUS.SHOW_QUESTION)

    expect(useLaunchStore.getState().armed).toBe(false)
  })
})

describe("GameWrapper score round", () => {
  afterEach(() => {
    cleanup()
    useManagerStore.getState().reset()
  })

  it("climbs by the questions a lecture deck has played, not by their number", () => {
    // Question 7 of 10 is only the second the deck has played.
    useManagerStore.getState().setLecture({
      inviteCode: "123456",
      total: 10,
      played: [2, 6],
      current: 6,
      finished: false,
    })
    vi.mocked(score.setRound).mockClear()

    render(
      <GameWrapper statusName={STATUS.SHOW_QUESTION} manager>
        <div>Question</div>
      </GameWrapper>,
    )

    expect(score.setRound).toHaveBeenLastCalledWith(2, 10)
  })

  it("follows the question number in a quiz played in order", () => {
    vi.mocked(score.setRound).mockClear()

    render(
      <GameWrapper statusName={STATUS.SHOW_QUESTION} manager>
        <div>Question</div>
      </GameWrapper>,
    )

    expect(score.setRound).toHaveBeenLastCalledWith(7, 10)
  })
})

describe("GameWrapper manager action acknowledgement", () => {
  it("does not duplicate question progress in the top bar", () => {
    render(
      <GameWrapper statusName={STATUS.SHOW_QUESTION} manager>
        <div>Question</div>
      </GameWrapper>,
    )

    expect(screen.queryByText("7 / 10")).not.toBeInTheDocument()
  })

  it("re-enables Skip when the same status changes command identity", async () => {
    const onNext = vi.fn()
    const { rerender } = render(
      <GameWrapper
        statusName={STATUS.SELECT_ANSWER}
        nextActionKey={EVENTS.MANAGER.UNLOCK_ANSWERS}
        onNext={onNext}
        manager
      >
        <div>Answers</div>
      </GameWrapper>,
    )
    const skip = screen.getByRole("button", { name: "common:skip" })

    fireEvent.click(skip)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(skip).toHaveClass("pointer-events-none")

    rerender(
      <GameWrapper
        statusName={STATUS.SELECT_ANSWER}
        nextActionKey={EVENTS.MANAGER.ABORT_QUIZ}
        onNext={onNext}
        manager
      >
        <div>Answers</div>
      </GameWrapper>,
    )

    await waitFor(() => expect(skip).not.toHaveClass("pointer-events-none"))
    fireEvent.click(skip)
    expect(onNext).toHaveBeenCalledTimes(2)
  })
})

const LEADERBOARD = { oldLeaderboard: [], leaderboard: [] }

const nextOnLeaderboard = () => (
  <GameWrapper
    statusName={STATUS.SHOW_LEADERBOARD}
    nextActionKey={EVENTS.MANAGER.NEXT_QUESTION}
    onNext={vi.fn()}
    manager
  >
    <div>Leaderboard</div>
  </GameWrapper>
)

const restoreLeaderboard = () => {
  useManagerStore.getState().setStatus(STATUS.SHOW_LEADERBOARD, {
    ...LEADERBOARD,
  })
}

const advance = (ms: number) => {
  vi.advanceTimersByTime(ms)
}

describe("GameWrapper Next after a click the server never saw", () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    socket.isConnected = true
    useManagerStore.getState().reset()
  })

  it("comes back when the reconnect restores the same screen", () => {
    restoreLeaderboard()
    render(nextOnLeaderboard())
    const next = screen.getByRole("button", { name: "common:next" })

    fireEvent.click(next)
    expect(next).toHaveClass("pointer-events-none")

    // Same name, same command: only the status object is new.
    act(restoreLeaderboard)

    expect(next).not.toHaveClass("pointer-events-none")
  })

  it("comes back when the socket reconnects", () => {
    socket.isConnected = false
    const { rerender } = render(nextOnLeaderboard())
    const next = screen.getByRole("button", { name: "common:next" })

    fireEvent.click(next)
    expect(next).toHaveClass("pointer-events-none")

    socket.isConnected = true
    rerender(nextOnLeaderboard())

    expect(next).not.toHaveClass("pointer-events-none")
  })

  it("comes back on its own after a few seconds", () => {
    vi.useFakeTimers()
    render(nextOnLeaderboard())
    const next = screen.getByRole("button", { name: "common:next" })

    fireEvent.click(next)
    act(() => advance(1_000))
    // Not at once: a quick double click must not send the command twice.
    expect(next).toHaveClass("pointer-events-none")

    act(() => advance(NEXT_RETRY_MS))

    expect(next).not.toHaveClass("pointer-events-none")
  })
})
