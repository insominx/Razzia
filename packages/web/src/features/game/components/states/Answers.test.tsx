import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Answers from "@razzia/web/features/game/components/states/Answers"
import type { SceneOptions, SceneSpec } from "@razzia/web/features/game/audio"
import { anchorOf, originMs } from "@razzia/web/features/game/audio/scenes"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"

const mocks = vi.hoisted(() => ({
  socketEmit: vi.fn(),
  start: vi.fn(),
  cue: vi.fn(),
  // A phone has a seat; the projector does not.
  player: { player: { username: "Player" } as unknown, gameId: "game-1" },
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.socketEmit } }),
  useEvent: vi.fn(),
}))

vi.mock("@razzia/web/features/game/stores/player", () => ({
  usePlayerStore: () => ({ ...mocks.player, setLastAnswer: vi.fn() }),
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
  questionNumber: 7,
  answers: ["First", "Second"],
  time: 10,
  totalPlayer: 2,
  revealStartedAt: 1_000,
  unlockAt: 5_000,
  serverNow: 1_000,
  answeringOpen: false,
  ...overrides,
})

const tiles = () =>
  [...document.querySelectorAll("[data-answer-tile]")] as HTMLElement[]

describe("Answers reveal lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"))
    vi.clearAllMocks()
    mocks.player = { player: { username: "Player" }, gameId: "game-1" }
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("reserves every slot while keeping reveal, HUD, music, and submit closed", async () => {
    const { rerender } = render(<Answers data={makeData()} />)
    const answerButtons = screen.getAllByRole("button")

    expect(answerButtons).toHaveLength(2)
    expect(answerButtons[0]).toBeDisabled()
    expect(answerButtons[1]).toBeDisabled()
    expect(answerButtons[0]).not.toHaveClass("rz-answer-slot-visible")
    expect(tiles().map((tile) => tile.dataset.state)).toEqual([
      "locked",
      "locked",
    ])
    expect(
      document.querySelector('[data-question-layout="game-question"]'),
    ).toHaveClass("w-full", "px-1", "py-3", "stage:p-0")
    expect(
      document.querySelector(
        '[data-question-number-layout="game-question-number"]',
      ),
    ).toHaveAttribute("data-question-number-phase", "settled")
    expect(
      answerButtons[0]?.parentElement?.style.getPropertyValue(
        "--rz-answer-reveal-fade",
      ),
    ).toBe("2000ms")
    // Until the server opens answering the clock counts down to it.
    expect(screen.getByText("game:hud.opensIn")).toBeInTheDocument()
    expect(screen.queryByText("game:hud.time")).not.toBeInTheDocument()
    expect(screen.getByText("game:hud.opensIn").parentElement).not.toHaveClass(
      "invisible",
    )
    // Power-on is already scoring: one scene, from the server's stamps.
    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "answers",
        answers: 2,
        time: 10,
        unlockAt: 5_000,
        serverNow: 1_000,
      }),
      { silent: false },
    )

    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(answerButtons[0]).not.toHaveClass("rz-answer-slot-visible")
    await act(() => vi.advanceTimersByTimeAsync(999))
    expect(answerButtons[0]).not.toHaveClass("rz-answer-slot-visible")
    await act(() => vi.advanceTimersByTimeAsync(1))

    // Revealed, but still dark: bright means go.
    expect(answerButtons[0]).toHaveClass("rz-answer-slot-visible")
    expect(answerButtons[0]).toHaveAttribute("data-state", "locked")
    expect(answerButtons[0]).toBeDisabled()
    expect(screen.getByText("First")).toBeInTheDocument()
    fireEvent.click(answerButtons[0])
    expect(mocks.socketEmit).not.toHaveBeenCalled()

    rerender(
      <Answers data={makeData({ answeringOpen: true, serverNow: 5_000 })} />,
    )

    expect(answerButtons[0]).toBeEnabled()
    expect(answerButtons[1]).toBeEnabled()
    expect(answerButtons[1]).toHaveClass("rz-answer-slot-visible")
    expect(tiles().map((tile) => tile.dataset.state)).toEqual([
      "active",
      "active",
    ])
    expect(screen.getByText("game:hud.time").parentElement).not.toHaveClass(
      "invisible",
    )
    expect(screen.queryByText("game:hud.opensIn")).not.toBeInTheDocument()
    // Opening answers asks for the same scene again; the score treats the
    // same stamps as a no-op, so a screen can ask on every change.
    expect(mocks.start).toHaveBeenCalledTimes(2)
    expect(mocks.start.mock.calls[1][0]).toMatchObject({ scene: "answers" })

    fireEvent.click(answerButtons[1])
    expect(mocks.socketEmit).toHaveBeenCalledWith("player:selectedAnswer", {
      gameId: "game-1",
      data: { answerKey: 1 },
    })
  })

  it("shows the press at once and sends a pick only once", () => {
    render(
      <Answers data={makeData({ answeringOpen: true, serverNow: 5_000 })} />,
    )

    expect(document.querySelector("[data-locked-in-pill]")).toBeNull()

    fireEvent.click(screen.getByText("Second"))

    // The words come with the press, not a round trip later.
    expect(document.querySelector("[data-locked-in-pill]")).toHaveTextContent(
      "game:lockedIn",
    )

    // Felt before the server has answered: this tile is picked, the rest step back.
    expect(tiles().map((tile) => tile.dataset.state)).toEqual([
      "faded",
      "picked",
    ])

    fireEvent.click(screen.getByText("First"))
    fireEvent.click(screen.getByText("Second"))

    expect(mocks.socketEmit).toHaveBeenCalledTimes(1)
  })

  it("sends the pick again when a reconnect shows the question still unanswered", () => {
    const open = makeData({ answeringOpen: true, serverNow: 5_000 })
    const { rerender } = render(<Answers data={open} />)

    // Tapped during a blip: the emit reaches the server before the phone has
    // rejoined, and is dropped.
    fireEvent.click(screen.getByText("Second"))
    expect(mocks.socketEmit).toHaveBeenCalledTimes(1)

    // The same screen again is not a reconnect.
    rerender(<Answers data={{ ...open }} />)
    expect(mocks.socketEmit).toHaveBeenCalledTimes(1)

    // The reconnect's own copy of the screen, restamped: still waiting.
    rerender(<Answers data={{ ...open, serverNow: 7_000 }} />)

    expect(mocks.socketEmit).toHaveBeenCalledTimes(2)
    expect(mocks.socketEmit).toHaveBeenLastCalledWith("player:selectedAnswer", {
      gameId: "game-1",
      data: { answerKey: 1 },
    })
    // Still the same pick, still locked in.
    expect(tiles().map((tile) => tile.dataset.state)).toEqual([
      "faded",
      "picked",
    ])
    expect(document.querySelector("[data-locked-in-pill]")).not.toBeNull()
  })

  it("drops an old question's pick when a reconnect lands on a new one", () => {
    const { rerender } = render(
      <Answers data={makeData({ answeringOpen: true, serverNow: 5_000 })} />,
    )

    fireEvent.click(screen.getByText("Second"))

    rerender(
      <Answers
        data={makeData({
          questionNumber: 8,
          answeringOpen: true,
          serverNow: 40_000,
        })}
      />,
    )

    // Question 7's pick is never sent as question 8's answer.
    expect(mocks.socketEmit).toHaveBeenCalledTimes(1)
    expect(tiles().map((tile) => tile.dataset.state)).toEqual([
      "active",
      "active",
    ])

    fireEvent.click(screen.getByText("First"))
    expect(mocks.socketEmit).toHaveBeenLastCalledWith("player:selectedAnswer", {
      gameId: "game-1",
      data: { answerKey: 0 },
    })
  })

  it("keeps the scene in the past when a review over the hidden screen ends", () => {
    mocks.player = { player: null, gameId: null as unknown as string }
    const data = makeData({ answeringOpen: true, serverNow: 5_000 })
    const arrivedAt = Date.now()

    try {
      render(<Answers data={data} />)

      act(() => useManagerStore.getState().setReview(0))
      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      act(() => useManagerStore.getState().setReview(null))

      const [spec, options] = mocks.start.mock.calls.at(-1) as [
        SceneSpec,
        SceneOptions,
      ]

      expect(options).toMatchObject({ silent: false })
      expect(
        originMs(anchorOf(spec) ?? null, Date.now(), options.offsetMs),
      ).toBe(arrivedAt + data.unlockAt - data.serverNow)
    } finally {
      useManagerStore.getState().reset()
    }
  })

  it("renders untappable tiles on the projector, where nobody has a seat", () => {
    mocks.player = { player: null, gameId: null as unknown as string }

    render(
      <Answers data={makeData({ answeringOpen: true, serverNow: 5_000 })} />,
    )

    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(tiles()).toHaveLength(2)
    expect(tiles().map((tile) => tile.tagName)).toEqual(["DIV", "DIV"])
    expect(tiles().map((tile) => tile.dataset.state)).toEqual([
      "active",
      "active",
    ])
  })

  it("keeps untimed HUD absent and suppresses music for audio/video", () => {
    render(
      <Answers
        data={makeData({
          time: -1,
          answeringOpen: true,
          media: { type: "audio", url: "/question.mp3" },
        })}
      />,
    )

    // Nothing to count down once an untimed question is open.
    expect(screen.getByText("game:hud.time").parentElement).toHaveClass(
      "invisible",
    )
    expect(mocks.start).not.toHaveBeenCalled()
    expect(screen.getAllByRole("button")).toHaveLength(2)
  })

  it("counts down to the answers opening, on the server's clock", async () => {
    // The server says it is 1 s in; the answers open at 5 s.
    render(<Answers data={makeData()} />)

    expect(screen.getByText("4")).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(2_000))
    expect(screen.getByText("2")).toBeInTheDocument()
  })

  it("draws the line: charging while revealed, burning once open, lit if untimed", () => {
    const { container, rerender } = render(
      <Answers data={makeData({ cooldown: 5 })} />,
    )
    const line = () => container.querySelector<HTMLElement>("[data-line]")

    // Two answers reveal faster than four, so the cooldown covers more of the
    // line: the answers screen picks it up part of the way along.
    expect(line()).toHaveAttribute("data-line", "grow")
    expect(line()?.style.getPropertyValue("--rz-line-to")).toBe("1")
    expect(
      Number(line()?.style.getPropertyValue("--rz-line-from")),
    ).toBeGreaterThan(0)

    rerender(
      <Answers
        data={makeData({ answeringOpen: true, serverNow: 5_000, time: 10 })}
      />,
    )
    expect(line()).toHaveAttribute("data-line", "burn")
    expect(line()?.style.getPropertyValue("--rz-line-dur")).toBe("10000ms")

    rerender(
      <Answers
        data={makeData({ answeringOpen: true, serverNow: 5_000, time: -1 })}
      />,
    )
    expect(line()).toHaveAttribute("data-line", "lit")
  })

  it("burns from where a late arrival finds it, not from the start", () => {
    const { container } = render(
      <Answers
        data={makeData({
          answeringOpen: true,
          unlockAt: 5_000,
          serverNow: 9_000,
          time: 20,
        })}
      />,
    )

    expect(
      container
        .querySelector<HTMLElement>("[data-line='burn']")
        ?.style.getPropertyValue("--rz-line-delay"),
    ).toBe("-4000ms")
  })

  it("shows all reduced-motion slots but leaves them disabled before unlock", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )

    render(<Answers data={makeData()} />)

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveClass("rz-answer-slot-visible")
      expect(button).toBeDisabled()
    }
    expect(mocks.start).toHaveBeenCalledTimes(1)
  })
})
