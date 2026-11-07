import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { afterEach, describe, expect, it, vi } from "vitest"
import GameWrapper from "@razzia/web/features/game/components/GameWrapper"

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

vi.mock("@razzia/web/features/game/stores/question", () => ({
  useQuestionStore: () => ({
    questionStates: { current: 7, total: 10 },
    setQuestionStates: vi.fn(),
  }),
}))

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
