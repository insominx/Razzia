import QuizzEditorSidebar from "@razzia/web/features/quizz/components/QuizzEditorSidebar"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setCurrentIndex: vi.fn(),
  dnd: {} as { onDragStart?: () => void; onDragCancel?: () => void },
}))

vi.mock("@dnd-kit/core", async () => {
  const actual =
    await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core")

  return {
    ...actual,
    DndContext: (props: {
      children: React.ReactNode
      onDragStart?: () => void
      onDragCancel?: () => void
    }) => {
      mocks.dnd.onDragStart = props.onDragStart
      mocks.dnd.onDragCancel = props.onDragCancel

      return <div>{props.children}</div>
    },
  }
})

vi.mock("@razzia/web/features/quizz/contexts/quizz-editor-context", () => ({
  useQuizzEditor: () => ({
    questions: [
      {
        id: "q1",
        question: "First?",
        answers: ["A", "B"],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
    ],
    currentIndex: 0,
    setCurrentIndex: mocks.setCurrentIndex,
    addQuestion: vi.fn(),
    removeQuestion: vi.fn(),
    reorderQuestions: vi.fn(),
  }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("QuizzEditorSidebar", () => {
  afterEach(() => {
    cleanup()
    mocks.setCurrentIndex.mockReset()
  })

  it("selects cards again after a drag is cancelled with Escape", () => {
    render(<QuizzEditorSidebar />)

    mocks.dnd.onDragStart?.()
    fireEvent.click(screen.getByText("First?"))

    expect(mocks.setCurrentIndex).not.toHaveBeenCalled()

    mocks.dnd.onDragCancel?.()
    fireEvent.click(screen.getByText("First?"))

    expect(mocks.setCurrentIndex).toHaveBeenCalledWith(0)
  })
})
