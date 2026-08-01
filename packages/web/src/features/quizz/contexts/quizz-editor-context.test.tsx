import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { QuizzEditorProvider, useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"

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
      result.current.clearBackground("/config-assets/backgrounds/global.png")
    })

    expect(result.current.background).toBeUndefined()
    expect(result.current.backgroundUrl).toBe(
      "/config-assets/backgrounds/global.png",
    )
  })
})
