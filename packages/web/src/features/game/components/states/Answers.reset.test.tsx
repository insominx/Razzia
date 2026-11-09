import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { EVENTS } from "@razzia/common/constants"
import Answers from "@razzia/web/features/game/components/states/Answers"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() } }),
  useEvent: (event: string, callback: (payload: unknown) => void) => {
    mocks.handlers.set(event, callback)
  },
}))

vi.mock("@razzia/web/features/game/stores/player", () => ({
  usePlayerStore: () => ({
    player: { username: "Player" },
    gameId: "game-1",
    setLastAnswer: vi.fn(),
  }),
}))

vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: { start: vi.fn(), cue: vi.fn() },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const makeData = (
  questionNumber: number,
): CommonStatusDataMap["SELECT_ANSWER"] => ({
  question: "Question",
  questionNumber,
  answers: ["First", "Second"],
  time: 20,
  totalPlayer: 12,
  revealStartedAt: 1_000,
  unlockAt: 1_000,
  serverNow: 1_000,
  answeringOpen: true,
})

describe("Answers on a reused screen", () => {
  beforeEach(() => {
    mocks.handlers.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it("starts the next question's count and clock over", () => {
    const { rerender } = render(<Answers data={makeData(3)} />)

    act(() => {
      mocks.handlers.get(EVENTS.GAME.COOLDOWN)?.(0)
      mocks.handlers.get(EVENTS.GAME.PLAYER_ANSWER)?.(12)
    })

    expect(screen.getByText("12/12")).toBeInTheDocument()

    rerender(<Answers data={makeData(4)} />)

    expect(screen.getByText("0/12")).toBeInTheDocument()
    expect(screen.queryByText("12/12")).not.toBeInTheDocument()
  })
})
