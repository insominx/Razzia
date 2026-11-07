import { EVENTS } from "@razzia/common/constants"
import { Route } from "@razzia/web/pages/manager/quizz/$quizzId"
import { act, cleanup, render } from "@testing-library/react"
import type { ComponentType } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Handler = (..._args: never[]) => void

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  socket: { emit: vi.fn() },
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    options,
    useParams: () => ({ quizzId: "no-such-quiz" }),
  }),
  useNavigate: () => mocks.navigate,
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: mocks.socket }),
  useEvent: (event: string, callback: Handler) => {
    mocks.handlers.set(event, callback)
  },
}))

vi.mock("react-hot-toast", () => ({
  default: { error: mocks.toastError },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => `t(${key})` }),
}))

vi.mock("@razzia/web/features/quizz/components/QuestionEditor", () => ({
  default: () => null,
}))

vi.mock("@razzia/web/features/quizz/components/QuizzEditorHeader", () => ({
  default: () => null,
}))

vi.mock("@razzia/web/features/quizz/components/QuizzEditorSidebar", () => ({
  default: () => null,
}))

vi.mock("@razzia/web/features/quizz/contexts/quizz-editor-context", () => ({
  QuizzEditorProvider: () => null,
}))

const EditPage = (Route as unknown as { options: { component: ComponentType } })
  .options.component

const fire = (event: string, ...args: unknown[]) => {
  act(() => {
    mocks.handlers.get(event)?.(...(args as never[]))
  })
}

describe("the quiz editor page", () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.navigate.mockReset()
    mocks.toastError.mockReset()
    mocks.socket.emit.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("says so and goes back to the quiz list when the quiz is not there", () => {
    render(<EditPage />)
    expect(mocks.socket.emit).toHaveBeenCalledWith(
      EVENTS.QUIZZ.GET,
      "no-such-quiz",
    )

    fire(EVENTS.QUIZZ.ERROR, "errors:quizz.notFound")

    expect(mocks.toastError).toHaveBeenCalledWith("t(errors:quizz.notFound)")
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      replace: true,
    })
  })

  // Once the quiz is open, its header answers a failed save, in place.
  it("stays in an open quiz when a save fails", () => {
    render(<EditPage />)
    fire(EVENTS.QUIZZ.DATA, {
      quizz: { id: "no-such-quiz", subject: "Quiz", questions: [] },
      resolvedVisuals: {},
    })

    fire(EVENTS.QUIZZ.ERROR, "errors:quizz.failedToSave")

    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
