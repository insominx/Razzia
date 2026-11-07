import { REHEARSAL_KEY } from "@razzia/web/features/rehearse/draft"
import RehearsalFrame from "@razzia/web/features/rehearse/RehearsalFrame"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { memoryStorage } from "@razzia/web/test/memory-storage"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@razzia/web/components/Atmosphere", () => ({ default: () => null }))

vi.mock("@razzia/web/features/game/components/VolumeControl", () => ({
  default: () => null,
}))

vi.mock("@razzia/web/features/game/stores/sound", () => ({
  useSoundStore: { getState: () => ({ bindSurface: vi.fn() }) },
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

const draft = JSON.stringify({
  subject: "Quiz",
  at: 0,
  questions: [
    {
      question: "Which boundary owns this state?",
      answers: ["The client", "The server", ""],
      solutions: [1],
      cooldown: 5,
      time: 20,
    },
  ],
  savedAt: Date.now(),
})

describe("RehearsalFrame", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage())
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("plays the draft's own words, with a stand-in for an empty answer", () => {
    localStorage.setItem(REHEARSAL_KEY, draft)
    render(
      <RehearsalFrame view="phone" fixture="answers" q={0} intensity="full" />,
    )

    expect(screen.getByText("The client")).toBeInTheDocument()
    expect(screen.getByText("The server")).toBeInTheDocument()
    expect(
      screen.getByText("quizz:rehearse.placeholder.answer"),
    ).toBeInTheDocument()
  })

  it("asks for a draft when there is none", () => {
    render(
      <RehearsalFrame view="host" fixture="answers" q={0} intensity="full" />,
    )

    expect(screen.getByText("quizz:rehearse.empty")).toBeInTheDocument()
  })

  it("passes the page's keys up to the page, and nobody else's", () => {
    localStorage.setItem(REHEARSAL_KEY, draft)
    const post = vi.spyOn(window.parent, "postMessage")

    render(
      <RehearsalFrame view="host" fixture="answers" q={0} intensity="full" />,
    )

    fireEvent.keyDown(window, { key: "ArrowRight" })
    fireEvent.keyDown(window, { key: "x" })
    fireEvent.keyDown(window, { key: "r", ctrlKey: true })

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(
      { source: "razzia-rehearsal-frame", key: "ArrowRight" },
      window.location.origin,
    )
  })

  it("sends the rehearsal on when the host's Next is pressed", () => {
    localStorage.setItem(REHEARSAL_KEY, draft)
    const post = vi.spyOn(window.parent, "postMessage")

    render(
      <RehearsalFrame view="host" fixture="answers" q={0} intensity="full" />,
    )

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /skip|next/i }))
    })

    expect(post).toHaveBeenCalledWith(
      { source: "razzia-rehearsal-frame", key: "ArrowRight" },
      window.location.origin,
    )
  })
})
