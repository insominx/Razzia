import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { EVENTS } from "@razzia/common/constants"
import type { ManagerConfig } from "@razzia/common/types/manager"
import ConfigSelectQuizz from "@razzia/web/features/manager/components/configurations/ConfigSelectQuizz"
import { ConfigProvider } from "@razzia/web/features/manager/contexts/config-context"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const emit = vi.fn<(..._args: unknown[]) => void>()
const toastError = vi.fn<(..._args: unknown[]) => void>()
const handlers = new Map<string, (..._args: unknown[]) => void>()

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit } }),
  useEvent: (event: string, callback: (..._args: unknown[]) => void) => {
    handlers.set(event, callback)
  },
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args: unknown[]) => toastError(...args),
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const config: ManagerConfig = {
  quizz: [{ id: "quiz-1", subject: "Quiz One", questionCount: 6 }],
  polls: [],
  pollResults: [],
  results: [],
  game: { resolvedVisuals: {} },
}

const lectureButton = () =>
  screen.getByRole("button", { name: "manager:quizz.startLecture" })

const gameButton = () =>
  screen.getByRole("button", { name: "manager:quizz.startGame" })

const renderSelect = (picked = true) => {
  render(
    <ConfigProvider data={config}>
      <ConfigSelectQuizz />
    </ConfigProvider>,
  )

  if (picked) {
    fireEvent.click(screen.getByRole("button", { name: /Quiz One/u }))
  }
}

describe("ConfigSelectQuizz lecture room", () => {
  beforeEach(() => {
    emit.mockReset()
    toastError.mockReset()
    handlers.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it("starts a lecture room for the chosen quiz, not a normal game", () => {
    renderSelect()

    fireEvent.click(lectureButton())

    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(EVENTS.GAME.CREATE_LECTURE, "quiz-1")
  })

  it("waits for a quiz to be chosen before either button works", () => {
    renderSelect(false)

    expect(lectureButton()).toBeDisabled()
    expect(gameButton()).toBeDisabled()

    fireEvent.click(lectureButton())

    expect(emit).not.toHaveBeenCalled()
  })

  it("creates one room while the server has not answered, whichever button is pressed", () => {
    renderSelect()

    fireEvent.click(lectureButton())
    fireEvent.click(lectureButton())
    fireEvent.click(gameButton())

    expect(emit).toHaveBeenCalledTimes(1)
    expect(lectureButton()).toBeDisabled()
    expect(gameButton()).toBeDisabled()
  })

  it("shows a create error and lets the manager try again", () => {
    renderSelect()
    fireEvent.click(lectureButton())

    act(() => {
      handlers.get(EVENTS.GAME.ERROR_MESSAGE)?.("errors:quizz.notFound")
    })

    expect(toastError).toHaveBeenCalledWith("errors:quizz.notFound")
    expect(lectureButton()).toBeEnabled()

    fireEvent.click(lectureButton())

    expect(emit).toHaveBeenCalledTimes(2)
  })

  it("says what a lecture room is", () => {
    renderSelect(false)

    expect(document.querySelector("[data-lecture-hint]")?.textContent).toBe(
      "manager:quizz.lectureHint",
    )
  })
})
