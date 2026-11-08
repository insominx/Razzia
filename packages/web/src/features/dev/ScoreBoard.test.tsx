import ScoreBoard from "@razzia/web/features/dev/ScoreBoard"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { score } = vi.hoisted(() => ({
  score: {
    configure: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    cue: vi.fn(),
    setRound: vi.fn(),
    dispose: vi.fn(),
    debug: vi.fn(() => ({ live: {} })),
  },
}))

vi.mock("@razzia/web/features/game/audio", () => ({ score }))
vi.mock("howler", () => ({
  Howler: {
    ctx: { resume: vi.fn(() => Promise.resolve()) },
    volume: vi.fn(),
    mute: vi.fn(),
  },
}))
vi.mock("@razzia/web/features/dev/small-speakers", () => ({
  routeHowlerThroughSmallSpeakers: vi.fn(() => vi.fn()),
}))

const row = (label: string) => {
  const cell = screen.getByText(label)
  const tr = cell.closest("tr")

  if (!tr) {
    throw new Error(`no row for ${label}`)
  }

  return tr
}

const press = (rowLabel: string, button: string) => {
  const target = Array.from(row(rowLabel).querySelectorAll("button")).find(
    (candidate) => candidate.textContent === button,
  )

  if (!target) {
    throw new Error(`no ${button} button in ${rowLabel}`)
  }

  fireEvent.click(target)
}

describe("ScoreBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(cleanup)

  it("configures the score from its own controls, starting on the show score", () => {
    render(<ScoreBoard />)

    expect(score.configure).toHaveBeenLastCalledWith({
      intensity: "full",
      theme: "show",
      surface: "host",
    })

    fireEvent.click(screen.getByRole("button", { name: "Calm" }))

    expect(score.configure).toHaveBeenLastCalledWith({
      intensity: "calm",
      theme: "show",
      surface: "host",
    })

    fireEvent.click(screen.getByRole("button", { name: "Classic" }))

    expect(score.configure).toHaveBeenLastCalledWith({
      intensity: "calm",
      theme: "classic",
      surface: "host",
    })
  })

  it("lists every scene and plays one with stamps in the near future", () => {
    render(<ScoreBoard />)

    for (const label of [
      "Lobby bed",
      "Title",
      "Start lights",
      "Round card",
      "TIME",
      "The count",
      "The spotlight",
      "Strike: crowd was right",
      "Strike: crowd was wrong",
      "Leaderboard groove",
      "Podium (three places)",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    press("Power-on, unlock, answering, last 5 s", "Play")

    const [spec] = score.start.mock.calls[0] as [
      {
        scene: string
        unlockAt: number
        revealStartedAt: number
        serverNow: number
      },
    ]

    expect(spec.scene).toBe("answers")
    expect(spec.unlockAt - spec.revealStartedAt).toBe(12_000)
    expect(spec.serverNow).toBeGreaterThanOrEqual(spec.revealStartedAt)
  })

  it("plays the two verdicts so right and wrong can be compared", () => {
    render(<ScoreBoard />)

    press("Strike: crowd was right", "Play")
    press("Strike: crowd was wrong", "Play")

    const outcomes = score.start.mock.calls.map(
      ([spec]) => (spec as { outcome: string }).outcome,
    )

    expect(outcomes).toEqual(["right", "wrong"])
  })

  it("shifts the stamps back to hear a scene join late", () => {
    render(<ScoreBoard />)

    fireEvent.change(screen.getByLabelText("Join late by"), {
      target: { value: "5" },
    })
    press("TIME", "Play")

    const [spec] = score.start.mock.calls[0] as [
      { resultsAt: number; serverNow: number },
    ]

    expect(spec.serverNow - spec.resultsAt).toBe(5000)
  })

  it("passes the round and the quiz length so the climb can be heard", () => {
    render(<ScoreBoard />)

    expect(score.setRound).toHaveBeenLastCalledWith(1, 6)

    fireEvent.change(screen.getByLabelText("Round"), { target: { value: "4" } })

    expect(score.setRound).toHaveBeenLastCalledWith(4, 6)
  })

  it("plays cues, stops a lane, and stops everything", () => {
    render(<ScoreBoard />)

    press("Answer in", "Play")
    expect(score.cue).toHaveBeenLastCalledWith({ cue: "pop", index: 0 })
    press("Answer in", "Play")
    expect(score.cue).toHaveBeenLastCalledWith({ cue: "pop", index: 1 })

    press("Lobby bed", "Stop")
    expect(score.stop).toHaveBeenLastCalledWith("bed", 0.3)

    fireEvent.click(screen.getByRole("button", { name: "Stop all" }))
    expect(score.stop).toHaveBeenLastCalledWith()
  })

  it("routes the page through the small speakers when asked", async () => {
    const { routeHowlerThroughSmallSpeakers } =
      await import("@razzia/web/features/dev/small-speakers")

    render(<ScoreBoard />)
    fireEvent.click(screen.getByRole("button", { name: "Small speakers" }))

    expect(routeHowlerThroughSmallSpeakers).toHaveBeenCalledTimes(1)
  })

  it("stops the score when it is closed", () => {
    const { unmount } = render(<ScoreBoard />)

    unmount()

    expect(score.stop).toHaveBeenCalled()
  })
})
