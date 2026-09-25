import { EVENTS, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import Answers from "@razzia/web/features/game/components/states/Answers"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  tick: vi.fn(),
  handlers: new Map<string, (payload: unknown) => void>(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit } }),
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

vi.mock("@razzia/web/features/game/hooks/use-sfx", () => ({
  useSfx: () => (path: string) => path,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("use-sound", () => ({
  default: (path: string) => [
    path.includes("boump") ? mocks.tick : vi.fn(),
    { stop: vi.fn() },
  ],
}))

vi.mock("@razzia/web/features/game/components/DotField", () => ({
  default: () => null,
}))

const makeData = (
  overrides: Partial<CommonStatusDataMap["SELECT_ANSWER"]> = {},
): CommonStatusDataMap["SELECT_ANSWER"] => ({
  question: "Question",
  questionNumber: 1,
  answers: ["First", "Second"],
  time: 20,
  totalPlayer: 2,
  revealStartedAt: 0,
  unlockAt: 6_000,
  serverNow: 6_000,
  answeringOpen: true,
  ...overrides,
})

const cooldown = (seconds: number[]) => {
  for (const sec of seconds) {
    act(() => {
      mocks.handlers.get(EVENTS.GAME.COOLDOWN)?.(sec)
    })
  }
}

describe("Answers feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, "vibrate")
  })

  it("ticks through the final five seconds of a timed answer window", () => {
    render(<Answers data={makeData()} />)

    cooldown([7, 6, 5, 4, 3, 2, 1])

    expect(mocks.tick).toHaveBeenCalledTimes(5)
  })

  it("stays quiet while answers are still revealing", () => {
    render(<Answers data={makeData({ answeringOpen: false })} />)

    cooldown([5, 4, 3])

    expect(mocks.tick).not.toHaveBeenCalled()
  })

  it("never ticks without a time limit", () => {
    render(<Answers data={makeData({ time: NO_TIME_LIMIT })} />)

    cooldown([5, 4, 3])

    expect(mocks.tick).not.toHaveBeenCalled()
  })

  it("buzzes the phone when an answer is sent", () => {
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, "vibrate", {
      value: vibrate,
      configurable: true,
    })

    render(<Answers data={makeData()} />)
    fireEvent.click(screen.getByText("Second"))

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId: "game-1",
      data: { answerKey: 1 },
    })
    expect(vibrate).toHaveBeenCalledWith([15])
  })
})
