import QuizzEditorCard from "@razzia/web/features/quizz/components/QuizzEditorCard"
import type { QuestionWithId } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const make = (overrides: Partial<QuestionWithId> = {}): QuestionWithId => ({
  id: "q1",
  question: "Which one?",
  answers: ["Yes", "No"],
  solutions: [0],
  cooldown: 5,
  time: 20,
  ...overrides,
})

const renderCard = (question: QuestionWithId) =>
  render(
    <QuizzEditorCard
      question={question}
      index={0}
      isActive={false}
      canDelete
      onClick={vi.fn()}
      onDelete={vi.fn()}
    />,
  )

describe("QuizzEditorCard fit warning", () => {
  afterEach(() => {
    cleanup()
  })

  it("is quiet for a question the stage can show", () => {
    const { container } = renderCard(make())

    expect(container.querySelector("[data-fit-warning]")).toBeNull()
  })

  it("marks a question with an answer too long for its tile", () => {
    const { container } = renderCard(
      make({ answers: ["Short", "x".repeat(120)] }),
    )

    expect(
      container
        .querySelector("[data-fit-warning]")
        ?.getAttribute("data-fit-warning"),
    ).toBe("answer")
    expect(container.querySelector("[data-fit-warning]")).toHaveAttribute(
      "aria-label",
      "quizz:fitWarning.card",
    )
  })
})

describe("QuizzEditorCard delete dialog", () => {
  afterEach(() => {
    cleanup()
  })

  it("does not select the card when the dialog is cancelled or confirmed", () => {
    const onClick = vi.fn()
    const onDelete = vi.fn()
    render(
      <QuizzEditorCard
        question={make()}
        index={0}
        isActive={false}
        canDelete
        onClick={onClick}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(screen.getByLabelText("quizz:question.deleteQuestion"))
    fireEvent.click(screen.getByText("common:cancel"))

    expect(onClick).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText("quizz:question.deleteQuestion"))
    fireEvent.click(screen.getByText("common:delete"))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })
})
