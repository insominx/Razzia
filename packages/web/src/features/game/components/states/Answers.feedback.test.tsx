import { EVENTS, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import Answers from "@razzia/web/features/game/components/states/Answers"
import { useMoodStore } from "@razzia/web/features/game/stores/mood"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  start: vi.fn(),
  cue: vi.fn(),
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

// The score has its own tests; here a screen is judged by what it asks of it.
vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: { start: mocks.start, cue: mocks.cue },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

  it("leaves the final five seconds' ticks to the answers scene", () => {
    render(<Answers data={makeData()} />)

    cooldown([7, 6, 5, 4, 3, 2, 1])

    // The ticks are scheduled with the scene, not fired by each second's event.
    expect(mocks.cue).not.toHaveBeenCalled()
    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.start.mock.calls[0][0]).toMatchObject({
      scene: "answers",
      time: 20,
    })
  })

  it("plays a rising note for each answer that comes in", () => {
    render(<Answers data={makeData()} />)

    act(() => {
      mocks.handlers.get(EVENTS.GAME.PLAYER_ANSWER)?.(1)
    })
    act(() => {
      mocks.handlers.get(EVENTS.GAME.PLAYER_ANSWER)?.(2)
    })

    expect(mocks.cue.mock.calls).toEqual([
      [{ cue: "pop", index: 1 }],
      [{ cue: "pop", index: 2 }],
    ])
  })

  it("sounds the player's own tap at once, before the server has answered", () => {
    render(<Answers data={makeData()} />)

    fireEvent.click(screen.getByText("First"))

    expect(mocks.cue).toHaveBeenCalledWith({ cue: "pop", index: 0 })
  })

  it("heats the clock and warms the room for the last five seconds", () => {
    const { container } = render(<Answers data={makeData()} />)
    const digit = () => container.querySelector<HTMLElement>("[data-hud-value]")

    cooldown([9])
    expect(digit()).toHaveTextContent("9")
    expect(digit()).not.toHaveClass("rz-hud-hot")
    expect(useMoodStore.getState().override).toBeNull()

    cooldown([5])
    expect(digit()).toHaveTextContent("5")
    expect(digit()).toHaveClass("rz-hud-hot", "text-warning")
    expect(useMoodStore.getState().override).toBe("warm")

    cooldown([4, 3, 2, 1])
    expect(digit()).toHaveTextContent("1")
    expect(digit()).toHaveClass("rz-hud-hot")
  })

  it("lets the room cool again when the screen goes", () => {
    const { unmount } = render(<Answers data={makeData()} />)

    cooldown([3])
    expect(useMoodStore.getState().override).toBe("warm")

    unmount()
    expect(useMoodStore.getState().override).toBeNull()
  })

  it("stays cool without a time limit", () => {
    render(<Answers data={makeData({ time: NO_TIME_LIMIT })} />)

    cooldown([3])

    expect(useMoodStore.getState().override).toBeNull()
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
