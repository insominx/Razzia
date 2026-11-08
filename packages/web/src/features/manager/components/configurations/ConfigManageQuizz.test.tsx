import { EVENTS } from "@razzia/common/constants"
import ConfigManageQuizz from "@razzia/web/features/manager/components/configurations/ConfigManageQuizz"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Ack = (error: Error | null, response?: unknown) => void

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  timeoutEmit: vi.fn(),
  timeout: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({
    socket: { emit: mocks.emit, timeout: mocks.timeout },
  }),
  useEvent: vi.fn(),
}))

vi.mock("@razzia/web/features/manager/contexts/config-context", () => ({
  useConfig: () => ({
    quizz: [
      { id: "q1", subject: "Capitals" },
      { id: "q2", subject: "Rivers" },
    ],
  }),
}))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))

vi.mock("react-hot-toast", () => ({
  default: { success: mocks.success, error: mocks.error },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const pick = (container: HTMLElement, file: File) => {
  const input = container.querySelector('input[type="file"]')

  if (!input) {
    throw new Error("Expected a file input in the rendered tree")
  }

  fireEvent.change(input, {
    target: { files: [file] },
  })
}

describe("ConfigManageQuizz import", () => {
  afterEach(() => {
    cleanup()
    Object.values(mocks).forEach((mock) => {
      mock.mockReset()
    })
  })

  it("refuses a file the socket would drop the connection over", () => {
    const { container } = render(<ConfigManageQuizz />)

    pick(
      container,
      new File([new Uint8Array(1_000_000)], "big.json", {
        type: "application/json",
      }),
    )

    expect(mocks.error).toHaveBeenCalledWith("manager:quizz.importTooLarge")
    expect(mocks.emit).not.toHaveBeenCalledWith(
      EVENTS.QUIZZ.SAVE,
      expect.anything(),
    )
  })
})

const deleteButtons = () =>
  screen.getAllByRole("button", { name: "common:delete" })

const confirmDelete = (rowIndex: number) => {
  fireEvent.click(deleteButtons()[rowIndex])
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "common:delete",
    }),
  )
}

describe("ConfigManageQuizz delete", () => {
  beforeEach(() => {
    mocks.timeout.mockReturnValue({ emit: mocks.timeoutEmit })
  })

  afterEach(() => {
    cleanup()
    Object.values(mocks).forEach((mock) => {
      mock.mockReset()
    })
  })

  const lastAck = () => mocks.timeoutEmit.mock.calls.at(-1)?.[2] as Ack
  const allEnabled = () =>
    deleteButtons().every((button) => !(button as HTMLButtonElement).disabled)

  it("shows no success before the server confirms, and locks the delete buttons", () => {
    render(<ConfigManageQuizz />)

    confirmDelete(0)

    expect(mocks.timeoutEmit).toHaveBeenCalledWith(
      EVENTS.QUIZZ.DELETE,
      "q1",
      expect.any(Function),
    )
    expect(mocks.success).not.toHaveBeenCalled()
    expect(
      deleteButtons().every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true)
  })

  it("toasts success only on { ok: true } and re-enables the buttons", () => {
    render(<ConfigManageQuizz />)
    confirmDelete(0)

    act(() => lastAck()(null, { ok: true }))

    expect(mocks.success).toHaveBeenCalledWith("manager:quizz.deleted")
    expect(mocks.error).not.toHaveBeenCalled()
    expect(allEnabled()).toBe(true)
  })

  it("toasts the server's error key and re-enables the buttons", () => {
    render(<ConfigManageQuizz />)
    confirmDelete(1)

    act(() => lastAck()(null, { error: "errors:quizz.failedToDelete" }))

    expect(mocks.error).toHaveBeenCalledWith("errors:quizz.failedToDelete")
    expect(mocks.success).not.toHaveBeenCalled()
    expect(allEnabled()).toBe(true)
  })

  it("treats a timed-out answer as a failure", () => {
    render(<ConfigManageQuizz />)
    confirmDelete(0)

    act(() => lastAck()(new Error("operation has timed out")))

    expect(mocks.error).toHaveBeenCalledWith("errors:quizz.failedToDelete")
    expect(mocks.success).not.toHaveBeenCalled()
    expect(allEnabled()).toBe(true)
  })
})
