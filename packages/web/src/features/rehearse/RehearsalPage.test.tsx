import { REHEARSAL_KEY } from "@razzia/web/features/rehearse/draft"
import RehearsalPage from "@razzia/web/features/rehearse/RehearsalPage"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { memoryStorage } from "@razzia/web/test/memory-storage"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}))

class FakeResizeObserver {
  observe: () => void

  unobserve = vi.fn()

  disconnect = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    this.observe = () => {
      callback(
        [{ contentRect: { width: 1200, height: 700 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
  }
}

const draft = (
  overrides: { at?: number; answers?: string[]; question?: string } = {},
) =>
  JSON.stringify({
    subject: "Quiz",
    at: overrides.at ?? 0,
    questions: [
      {
        question: overrides.question ?? "First?",
        answers: overrides.answers ?? ["A", "B"],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
      {
        question: "Second?",
        answers: ["A", "B"],
        solutions: [1],
        cooldown: 5,
        time: 20,
      },
    ],
  })

const frame = () => {
  const iframe = document.querySelector("iframe")

  if (!iframe) {
    throw new Error("no frame")
  }

  return new URL(iframe.getAttribute("src") ?? "", window.location.origin)
}

describe("RehearsalPage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage())
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 1200,
    })
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      value: 700,
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("says what to do when nothing has been saved", () => {
    render(<RehearsalPage />)

    expect(screen.getByText("quizz:rehearse.empty")).toBeInTheDocument()
    expect(document.querySelector("iframe")).toBeNull()
  })

  it("opens on the question the editor was on, on the projector's answers", () => {
    localStorage.setItem(REHEARSAL_KEY, draft({ at: 1 }))
    render(<RehearsalPage />)

    const { searchParams, pathname } = frame()

    expect(pathname).toBe("/rehearse/frame")
    expect(searchParams.get("view")).toBe("host")
    expect(searchParams.get("fixture")).toBe("answers")
    expect(searchParams.get("q")).toBe("1")
  })

  it("steps through the screens and on into the next question", () => {
    localStorage.setItem(REHEARSAL_KEY, draft())
    render(<RehearsalPage />)

    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(frame().searchParams.get("fixture")).toBe("reveal")
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(frame().searchParams.get("fixture")).toBe("reveal-wrong")

    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(frame().searchParams.get("q")).toBe("1")
    expect(frame().searchParams.get("fixture")).toBe("question")

    // And back again, onto the last screen of the question before.
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(frame().searchParams.get("q")).toBe("0")
    expect(frame().searchParams.get("fixture")).toBe("reveal-wrong")
  })

  it("stops at the ends of the quiz", () => {
    localStorage.setItem(REHEARSAL_KEY, draft())
    render(<RehearsalPage />)

    fireEvent.keyDown(window, { key: "ArrowUp" })
    expect(frame().searchParams.get("q")).toBe("0")

    fireEvent.keyDown(window, { key: "ArrowDown" })
    fireEvent.keyDown(window, { key: "ArrowDown" })
    expect(frame().searchParams.get("q")).toBe("1")
  })

  it("switches to the phone, keeping the same moment of the question", () => {
    localStorage.setItem(REHEARSAL_KEY, draft())
    render(<RehearsalPage />)

    fireEvent.click(screen.getByText("quizz:rehearse.view.phone"))

    expect(frame().searchParams.get("view")).toBe("phone")
    expect(frame().searchParams.get("fixture")).toBe("answers")
    expect(
      screen.getByText("quizz:rehearse.screens.verdict"),
    ).toBeInTheDocument()

    fireEvent.keyDown(window, { key: "p" })
    expect(frame().searchParams.get("view")).toBe("host")
  })

  it("plays a screen again with a new frame", () => {
    localStorage.setItem(REHEARSAL_KEY, draft())
    render(<RehearsalPage />)

    const before = frame().searchParams.get("n")

    fireEvent.keyDown(window, { key: "r" })

    expect(frame().searchParams.get("n")).not.toBe(before)
  })

  it("takes keys from the frame it holds", () => {
    localStorage.setItem(REHEARSAL_KEY, draft())
    render(<RehearsalPage />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { source: "razzia-rehearsal-frame", key: "ArrowRight" },
          origin: window.location.origin,
        }),
      )
    })
    expect(frame().searchParams.get("fixture")).toBe("reveal")

    // Anything from anywhere else is not a key.
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { source: "razzia-rehearsal-frame", key: "ArrowRight" },
          origin: "https://elsewhere.example",
        }),
      )
    })
    expect(frame().searchParams.get("fixture")).toBe("reveal")
  })

  it("leaves typing in a field alone", () => {
    localStorage.setItem(REHEARSAL_KEY, draft())
    render(<RehearsalPage />)

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowRight" })

    expect(frame().searchParams.get("fixture")).toBe("answers")
  })

  it("shows a new draft in place when the editor saves another", () => {
    localStorage.setItem(REHEARSAL_KEY, draft())
    render(<RehearsalPage />)

    const before = frame().searchParams.get("n")

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: REHEARSAL_KEY,
          newValue: draft({ question: "Rewritten?" }),
        }),
      )
    })

    expect(frame().searchParams.get("n")).not.toBe(before)
  })

  it("warns about a question the projector may not hold", () => {
    localStorage.setItem(
      REHEARSAL_KEY,
      draft({ answers: ["x".repeat(120), "B"] }),
    )
    render(<RehearsalPage />)

    expect(screen.getByText("quizz:fitWarning.answer")).toBeInTheDocument()
  })

  it("has no warning for an ordinary question", () => {
    localStorage.setItem(REHEARSAL_KEY, draft())
    render(<RehearsalPage />)

    expect(document.querySelector("[data-fit-problems]")).toBeNull()
  })
})
