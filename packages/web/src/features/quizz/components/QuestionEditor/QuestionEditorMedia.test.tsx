import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ updateQuestion: vi.fn() }))

vi.mock("@razzia/web/features/quizz/contexts/quizz-editor-context", () => ({
  useQuizzEditor: () => ({
    updateQuestion: mocks.updateQuestion,
    currentIndex: 2,
    currentQuestion: { media: { url: "x" } },
  }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("QuestionEditorMedia", () => {
  afterEach(() => {
    cleanup()
    mocks.updateQuestion.mockReset()
  })

  it("clears the media when the URL box is emptied", () => {
    render(<QuestionEditorMedia />)

    fireEvent.change(
      screen.getByPlaceholderText("quizz:question.mediaUrlPlaceholder"),
      { target: { value: "" } },
    )

    expect(mocks.updateQuestion).toHaveBeenCalledWith(2, { media: undefined })
  })

  it("keeps a typed URL", () => {
    render(<QuestionEditorMedia />)

    fireEvent.change(
      screen.getByPlaceholderText("quizz:question.mediaUrlPlaceholder"),
      { target: { value: "https://a.b/c.png" } },
    )

    expect(mocks.updateQuestion).toHaveBeenCalledWith(2, {
      media: { url: "https://a.b/c.png" },
    })
  })
})
