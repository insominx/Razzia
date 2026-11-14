import { cleanup, render, screen } from "@testing-library/react"
import { STATUS } from "@razzia/common/types/game/status"
import { afterEach, describe, expect, it, vi } from "vitest"
import GameWrapper from "@razzia/web/features/game/components/GameWrapper"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"

vi.mock("@razzia/web/components/Atmosphere", () => ({
  default: () => null,
}))

vi.mock("@razzia/web/features/game/components/VolumeControl", () => ({
  default: () => <button type="button">volume</button>,
}))

vi.mock("@razzia/web/features/game/components/LectureJoinHint", () => ({
  default: () => <p>join hint</p>,
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useEvent: vi.fn(),
  useSocket: () => ({ isConnected: true }),
}))

vi.mock("@razzia/web/features/game/stores/player", () => ({
  usePlayerStore: () => ({ player: null }),
}))

vi.mock("@razzia/web/features/game/stores/question", () => ({
  useQuestionStore: () => ({ setQuestionStates: vi.fn() }),
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

const renderManager = () =>
  render(
    <GameWrapper
      statusName={STATUS.SHOW_RESPONSES}
      onNext={vi.fn()}
      onBack={vi.fn()}
      manager
    >
      <div>Results</div>
    </GameWrapper>,
  )

describe("GameWrapper host controls", () => {
  afterEach(() => {
    cleanup()
    useManagerStore.getState().setHostControls(true)
  })

  it("shows Next, Exit and the join hint outside a deck", () => {
    renderManager()

    expect(screen.getByText("common:exit")).toBeInTheDocument()
    expect(screen.getByText("join hint")).toBeInTheDocument()
    expect(screen.getAllByRole("button")).toHaveLength(3)
  })

  // The frame takes no clicks then, so the deck draws the sound button.
  it("hides them and the volume while a deck drives the game", () => {
    useManagerStore.getState().setHostControls(false)
    renderManager()

    expect(screen.queryByText("common:exit")).not.toBeInTheDocument()
    expect(screen.queryByText("join hint")).not.toBeInTheDocument()
    expect(screen.queryByText("volume")).not.toBeInTheDocument()
    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(screen.getByText("Results")).toBeInTheDocument()
  })

  it("keeps the volume for a player in a deck's room", () => {
    useManagerStore.getState().setHostControls(false)
    render(
      <GameWrapper statusName={STATUS.SHOW_RESPONSES}>
        <div>Results</div>
      </GameWrapper>,
    )

    expect(screen.getByText("volume")).toBeInTheDocument()
  })

  it("a reset keeps the deck's choice", () => {
    useManagerStore.getState().setHostControls(false)
    useManagerStore.getState().reset()

    expect(useManagerStore.getState().hostControls).toBe(false)
  })
})
