import { parseDraft, REHEARSAL_KEY } from "@razzia/web/features/rehearse/draft"
import QuizzEditorHeader from "@razzia/web/features/quizz/components/QuizzEditorHeader"
import { QuizzEditorProvider } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { memoryStorage, refusingStorage } from "@razzia/web/test/memory-storage"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() } }),
  useEvent: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))

vi.mock("@razzia/web/features/quizz/components/QuizzBackgroundControl", () => ({
  default: () => null,
}))

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: mocks.error },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const quizz = {
  id: "quizz-1",
  subject: "Unsaved title",
  questions: [
    {
      question: "One?",
      answers: ["A", "B"],
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
    {
      question: "Two?",
      answers: ["C", "D"],
      solutions: [1],
      cooldown: 5,
      time: 20,
    },
  ],
}

const renderHeader = () =>
  render(
    <QuizzEditorProvider initialData={quizz}>
      <QuizzEditorHeader />
    </QuizzEditorProvider>,
  )

describe("QuizzEditorHeader rehearse", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage())
    vi.spyOn(window, "open").mockReturnValue(null)
    mocks.error.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("saves what is on screen for the rehearsal and opens it", () => {
    renderHeader()

    fireEvent.change(
      screen.getByPlaceholderText("quizz:titleQuizzPlaceholder"),
      {
        target: { value: "Edited, not saved" },
      },
    )
    fireEvent.click(screen.getByText("quizz:rehearse.button"))

    const saved = parseDraft(localStorage.getItem(REHEARSAL_KEY))

    expect(saved?.subject).toBe("Edited, not saved")
    expect(saved?.questions).toHaveLength(2)
    expect(saved?.at).toBe(0)
    expect(window.open).toHaveBeenCalledWith("/rehearse", "razzia-rehearsal")
  })

  it("says so when the browser will not keep the draft", () => {
    vi.stubGlobal("localStorage", refusingStorage())
    renderHeader()

    fireEvent.click(screen.getByText("quizz:rehearse.button"))

    expect(window.open).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith("quizz:rehearse.unavailable")
  })
})
