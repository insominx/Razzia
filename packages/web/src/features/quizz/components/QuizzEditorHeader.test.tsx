import { parseDraft, REHEARSAL_KEY } from "@razzia/web/features/rehearse/draft"
import QuizzEditorHeader from "@razzia/web/features/quizz/components/QuizzEditorHeader"
import { QuizzEditorProvider } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { memoryStorage, refusingStorage } from "@razzia/web/test/memory-storage"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface BlockerOpts {
  shouldBlockFn: () => boolean
}

const IDLE = { status: "idle" } as const

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  navigate: vi.fn(),
  proceed: vi.fn(),
  reset: vi.fn(),
  blockerOpts: null as unknown as { shouldBlockFn: () => boolean },
  resolver: { status: "idle" } as Record<string, unknown>,
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() } }),
  useEvent: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useBlocker: (opts: BlockerOpts) => {
    mocks.blockerOpts = opts

    return mocks.resolver
  },
}))

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
    mocks.resolver = IDLE
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

describe("QuizzEditorHeader leave guard", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage())
    mocks.navigate.mockClear()
    mocks.proceed.mockClear()
    mocks.reset.mockClear()
    mocks.resolver = IDLE
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const edit = () =>
    fireEvent.change(
      screen.getByPlaceholderText("quizz:titleQuizzPlaceholder"),
      { target: { value: "Edited" } },
    )

  const block = () => {
    mocks.resolver = {
      status: "blocked",
      proceed: mocks.proceed,
      reset: mocks.reset,
    }
  }

  it("lets an untouched quiz leave", () => {
    renderHeader()

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(false)
  })

  it("blocks leaving once the quiz has unsaved edits", () => {
    renderHeader()
    edit()

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(true)
  })

  it("asks before discarding and leaves on confirm", () => {
    block()
    renderHeader()

    expect(screen.getByText("quizz:unsaved.title")).toBeTruthy()

    fireEvent.click(screen.getByText("quizz:unsaved.discard"))

    expect(mocks.proceed).toHaveBeenCalledTimes(1)
  })

  it("stays in the editor on cancel", () => {
    block()
    renderHeader()

    fireEvent.click(screen.getByText("common:cancel"))

    expect(mocks.reset).toHaveBeenCalledTimes(1)
    expect(mocks.proceed).not.toHaveBeenCalled()
  })

  it("shows no prompt while nothing is blocked", () => {
    renderHeader()

    expect(screen.queryByText("quizz:unsaved.title")).toBeNull()
  })

  it("exits an untouched quiz past the blocker", () => {
    renderHeader()

    fireEvent.click(screen.getByText("common:exit"))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager",
      ignoreBlocker: true,
    })
  })

  it("exits after its own confirmation without asking twice", () => {
    renderHeader()
    edit()

    fireEvent.click(screen.getByText("common:exit"))

    expect(mocks.navigate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText("quizz:unsaved.discard"))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager",
      ignoreBlocker: true,
    })
  })
})
