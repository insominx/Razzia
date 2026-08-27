import { act, render, renderHook, screen } from "@testing-library/react"
import type { Question } from "@razzia/common/types/game"
import { describe, expect, it, vi } from "vitest"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import {
  QuizzEditorProvider,
  useQuizzEditor,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const question = (text: string): Question => ({
  question: text,
  answers: ["A", "B"],
  solutions: [0],
  cooldown: 5,
  time: 20,
})

const editorWrapper = (questions: Question[]) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QuizzEditorProvider
        initialData={{
          id: "q1",
          subject: "Test",
          questions,
        }}
      >
        {children}
      </QuizzEditorProvider>
    )
  }

describe("QuizzEditorProvider background clear", () => {
  it("restores the global fallback url when clearing a quiz override", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QuizzEditorProvider
        initialBackgroundUrl="/config-assets/backgrounds/global.png"
        initialData={{
          id: "q1",
          subject: "Test",
          visuals: {
            background: { kind: "config-asset", path: "quiz.png" },
          },
          questions: [
            {
              question: "Q",
              answers: ["A", "B"],
              solutions: [0],
              cooldown: 5,
              time: 20,
            },
          ],
        }}
      >
        {children}
      </QuizzEditorProvider>
    )

    const { result } = renderHook(() => useQuizzEditor(), { wrapper })

    act(() => {
      result.current.setBackground(
        { kind: "config-asset", path: "quiz.png" },
        "/config-assets/backgrounds/quiz.png",
      )
    })

    act(() => {
      result.current.setBackground(
        undefined,
        "/config-assets/backgrounds/global.png",
      )
    })

    expect(result.current.background).toBeUndefined()
    expect(result.current.backgroundUrl).toBe(
      "/config-assets/backgrounds/global.png",
    )
  })
})

describe("QuizzEditorProvider removeQuestion", () => {
  it("keeps currentQuestion defined after deleting the selected last question", () => {
    const { result } = renderHook(() => useQuizzEditor(), {
      wrapper: editorWrapper([
        question("First"),
        question("Second"),
        question("Third"),
      ]),
    })

    act(() => {
      result.current.setCurrentIndex(2)
    })
    act(() => {
      result.current.removeQuestion(2)
    })

    expect(result.current.currentIndex).toBe(1)
    expect(result.current.currentQuestion.question).toBe("Second")
  })

  it("moves the selection down when a prior question is removed", () => {
    const { result } = renderHook(() => useQuizzEditor(), {
      wrapper: editorWrapper([
        question("First"),
        question("Second"),
        question("Third"),
      ]),
    })

    act(() => {
      result.current.setCurrentIndex(2)
    })
    act(() => {
      result.current.removeQuestion(0)
    })

    expect(result.current.currentIndex).toBe(1)
    expect(result.current.currentQuestion.question).toBe("Third")
    expect(result.current.questions).toHaveLength(2)
  })

  it("does not remove the last remaining question", () => {
    const { result } = renderHook(() => useQuizzEditor(), {
      wrapper: editorWrapper([question("Only")]),
    })

    act(() => {
      result.current.removeQuestion(0)
    })

    expect(result.current.questions).toHaveLength(1)
    expect(result.current.currentQuestion.question).toBe("Only")
  })

  it("does not crash the title field after deleting the selected last question", () => {
    const SelectLastAndDelete = () => {
      const { setCurrentIndex, removeQuestion } = useQuizzEditor()

      return (
        <>
          <button type="button" onClick={() => setCurrentIndex(2)}>
            select-last
          </button>
          <button type="button" onClick={() => removeQuestion(2)}>
            delete-last
          </button>
        </>
      )
    }

    render(
      <QuizzEditorProvider
        initialData={{
          id: "q1",
          subject: "Test",
          questions: [question("First"), question("Second"), question("Third")],
        }}
      >
        <QuestionEditorTitle />
        <SelectLastAndDelete />
      </QuizzEditorProvider>,
    )

    act(() => {
      screen.getByRole("button", { name: "select-last" }).click()
    })
    expect(screen.getByDisplayValue("Third")).toBeInTheDocument()

    act(() => {
      screen.getByRole("button", { name: "delete-last" }).click()
    })
    expect(screen.getByDisplayValue("Second")).toBeInTheDocument()
  })
})
