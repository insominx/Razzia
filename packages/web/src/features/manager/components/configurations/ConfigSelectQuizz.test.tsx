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
  useTranslation: () => ({ t: (key: string) => key }),
}))

const config: ManagerConfig = {
  quizz: [{ id: "quiz-1", subject: "Quiz One" }],
  results: [],
  game: { resolvedVisuals: {} },
}

const renderSelect = () => {
  render(
    <ConfigProvider data={config}>
      <ConfigSelectQuizz />
    </ConfigProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "Quiz One" }))

  return screen.getByRole("button", { name: "manager:quizz.startGame" })
}

describe("ConfigSelectQuizz game creation", () => {
  beforeEach(() => {
    emit.mockReset()
    toastError.mockReset()
    handlers.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it("sends a single create while the server has not answered", () => {
    const start = renderSelect()

    fireEvent.click(start)
    fireEvent.click(start)

    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(EVENTS.GAME.CREATE, "quiz-1")
    expect(start).toBeDisabled()
  })

  it("shows a create error and lets the manager try again", () => {
    const start = renderSelect()
    fireEvent.click(start)

    act(() => {
      handlers.get(EVENTS.GAME.ERROR_MESSAGE)?.("errors:quizz.notFound")
    })

    expect(toastError).toHaveBeenCalledWith("errors:quizz.notFound")
    expect(start).toBeEnabled()

    fireEvent.click(start)
    expect(emit).toHaveBeenCalledTimes(2)
  })
})
