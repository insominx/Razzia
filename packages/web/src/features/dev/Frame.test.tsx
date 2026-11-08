import { EVENTS } from "@razzia/common/constants"
import { splitQuestionSentences } from "@razzia/common/utils/question-transition"
import { getDirector } from "@razzia/web/features/dev/director-api"
import Frame from "@razzia/web/features/dev/Frame"
import { QUIZZES, waitStatus } from "@razzia/web/features/dev/fixtures"
import { socketClient } from "@razzia/web/features/game/contexts/socket-context"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@razzia/web/components/Atmosphere", () => ({ default: () => null }))

vi.mock("@razzia/web/features/game/components/VolumeControl", () => ({
  default: () => null,
}))

vi.mock("@razzia/web/features/game/stores/sound", () => ({
  useSoundStore: {
    getState: () => ({ bindSurface: vi.fn() }),
    subscribe: () => () => undefined,
  },
}))

vi.mock("@razzia/web/hooks/use-surface", () => ({
  useSurfaceOverride: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

const [{ id: quizId, quiz }] = QUIZZES
const [first] = quiz.questions
const initial = { fixture: "answers", quizId, question: 0 } as const

const director = () => {
  const api = getDirector(window)

  if (!api) {
    throw new Error("the frame published no API")
  }

  return api
}

const renderFrame = (view: "host" | "phone") =>
  render(
    <Frame
      view={view}
      initial={initial}
      dialect="dark-everywhere"
      surface="stage"
    />,
  )

describe("Frame", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows a real question and its answers, open for answering", () => {
    renderFrame("phone")

    expect(
      screen.getByText(splitQuestionSentences(first.question)[0]),
    ).toBeInTheDocument()

    for (const answer of first.answers) {
      expect(screen.getByText(answer)).toBeInTheDocument()
    }
    expect(
      document.querySelectorAll("[data-answer-tile][data-state='active']"),
    ).toHaveLength(first.answers.length)
  })

  it("sends a tapped answer to the fake socket and never the real one", () => {
    const realEmit = vi.spyOn(socketClient, "emit")
    const seen = vi.fn()

    renderFrame("phone")
    director().onEmit(seen)
    fireEvent.click(screen.getByText(first.answers[1]))

    expect(seen).toHaveBeenCalledWith(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId: "dev-frame",
      data: { answerKey: 1 },
    })
    expect(realEmit).not.toHaveBeenCalled()
  })

  it("sends the host's Skip to the fake socket", () => {
    const realEmit = vi.spyOn(socketClient, "emit")
    const seen = vi.fn()

    renderFrame("host")
    director().onEmit(seen)
    fireEvent.click(screen.getByRole("button", { name: "common:skip" }))

    // The answers are already open, so Skip ends the window.
    expect(seen).toHaveBeenCalledWith(EVENTS.MANAGER.ABORT_QUIZ, {
      gameId: "dev-frame",
    })
    expect(realEmit).not.toHaveBeenCalled()
  })

  it("takes a live status from the Director and swaps the screen", () => {
    renderFrame("phone")

    act(() => {
      director().showStatus(waitStatus())
    })

    expect(screen.getByText("game:waitingForAnswers")).toBeInTheDocument()
    expect(screen.queryByText(first.answers[0])).not.toBeInTheDocument()
  })

  it("delivers server events to the screen, like the countdown", () => {
    renderFrame("host")

    act(() => {
      director().deliver(EVENTS.GAME.COOLDOWN, 7)
    })

    expect(screen.getByText("7")).toBeInTheDocument()
  })

  it("mounts another fixture fresh", () => {
    // Any real quiz with a second question will do.
    const entry = QUIZZES.find(
      ({ quiz: candidate }) => candidate.questions.length > 1,
    )
    const second = entry?.quiz.questions[1]

    expect(second).toBeDefined()
    renderFrame("host")

    act(() => {
      director().showFixture({
        fixture: "answers",
        quizId: entry?.id ?? quizId,
        question: 1,
      })
    })

    expect(
      screen.getByText(splitQuestionSentences(second?.question ?? "")[0]),
    ).toBeInTheDocument()
  })

  it("measures its tiles for the fit report", () => {
    // Jsdom has no scrolling; the frame rewinds to the top before measuring.
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
    renderFrame("phone")

    expect(director().measure().tiles).toHaveLength(first.answers.length)
  })

  it("withdraws its API when it goes away", () => {
    const { unmount } = renderFrame("phone")

    expect(getDirector(window)).not.toBeNull()
    unmount()
    expect(getDirector(window)).toBeNull()
  })
})
