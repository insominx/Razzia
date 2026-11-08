import { EVENTS } from "@razzia/common/constants"
import QuizzEditorHeader from "@razzia/web/features/quizz/components/QuizzEditorHeader"
import { QuizzEditorProvider } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { memoryStorage } from "@razzia/web/test/memory-storage"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  navigate: vi.fn(),
  handlers: new Map<string, (_payload?: unknown) => void>(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit } }),
  useEvent: (event: string, handler: (_payload?: unknown) => void) => {
    mocks.handlers.set(event, handler)
  },
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useBlocker: () => ({ status: "idle" }),
}))

vi.mock("@razzia/web/features/quizz/components/QuizzBackgroundControl", () => ({
  default: () => null,
}))

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("QuizzEditorHeader save", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage())
  })

  afterEach(() => {
    cleanup()
    mocks.emit.mockReset()
    mocks.navigate.mockReset()
    mocks.handlers.clear()
    vi.unstubAllGlobals()
  })

  it("sends a save once however many times it is clicked", () => {
    render(
      <QuizzEditorProvider
        initialData={{
          id: "q-1",
          subject: "Title",
          questions: [
            {
              question: "One?",
              answers: ["A", "B"],
              solutions: [0],
              cooldown: 5,
              time: 20,
            },
          ],
        }}
      >
        <QuizzEditorHeader />
      </QuizzEditorProvider>,
    )

    fireEvent.click(screen.getByText("common:save"))
    fireEvent.click(screen.getByText("common:save"))

    expect(mocks.emit).toHaveBeenCalledTimes(1)
  })

  const newQuizz = () =>
    render(
      <QuizzEditorProvider
        initialData={{
          id: "",
          subject: "Title",
          questions: [
            {
              question: "One?",
              answers: ["A", "B"],
              solutions: [0],
              cooldown: 5,
              time: 20,
            },
          ],
        }}
      >
        <QuizzEditorHeader />
      </QuizzEditorProvider>,
    )

  const sentIds = () =>
    mocks.emit.mock.calls.map(([, payload]) => (payload as { id: string }).id)

  it("names a new quiz, and keeps that name through retries and edits", () => {
    vi.useFakeTimers()
    newQuizz()

    fireEvent.click(screen.getByText("common:save"))
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    fireEvent.click(screen.getByText("common:save"))
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    fireEvent.change(
      screen.getByPlaceholderText("quizz:titleQuizzPlaceholder"),
      { target: { value: "Edited" } },
    )
    fireEvent.click(screen.getByText("common:save"))
    vi.useRealTimers()

    const [first, ...rest] = sentIds()

    expect(first).toMatch(/^quizz-[0-9a-f]{24}$/u)
    expect(rest).toEqual([first, first])
  })

  it("names two editors' new quizzes apart", () => {
    newQuizz()
    fireEvent.click(screen.getByText("common:save"))
    cleanup()
    newQuizz()
    fireEvent.click(screen.getByText("common:save"))

    const [one, two] = sentIds()

    expect(one).not.toBe(two)
  })

  it.each([EVENTS.QUIZZ.SAVE_SUCCESS, EVENTS.QUIZZ.UPDATE_SUCCESS])(
    "goes to the config on %s without asking to discard",
    (event) => {
      render(
        <QuizzEditorProvider
          initialData={{ id: "q-1", subject: "T", questions: [] }}
        >
          <QuizzEditorHeader />
        </QuizzEditorProvider>,
      )

      mocks.handlers.get(event)?.({})

      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/manager/config",
        ignoreBlocker: true,
      })
    },
  )
})
