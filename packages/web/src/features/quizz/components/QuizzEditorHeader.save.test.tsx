import { EVENTS } from "@razzia/common/constants"
import QuizzEditorHeader from "@razzia/web/features/quizz/components/QuizzEditorHeader"
import { QuizzEditorProvider } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { memoryStorage } from "@razzia/web/test/memory-storage"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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
