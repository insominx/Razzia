import { EVENTS } from "@razzia/common/constants"
import ConfigResults from "@razzia/web/features/manager/components/configurations/ConfigResults"
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
    results: [
      {
        id: "r1",
        subject: "Capitals",
        date: "2026-01-01T10:00:00.000Z",
        playerCount: 3,
      },
      {
        id: "r2",
        subject: "Rivers",
        date: "2026-01-02T10:00:00.000Z",
        playerCount: 5,
      },
    ],
  }),
}))

vi.mock("react-hot-toast", () => ({
  default: { success: mocks.success, error: mocks.error },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const confirmDelete = (rowIndex: number) => {
  fireEvent.click(
    screen.getAllByRole("button", { name: "common:delete" })[rowIndex],
  )
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "common:delete",
    }),
  )
}

const deleteButtons = () =>
  screen.getAllByRole("button", { name: "common:delete" })

describe("ConfigResults delete", () => {
  beforeEach(() => {
    mocks.timeout.mockReturnValue({ emit: mocks.timeoutEmit })
  })

  afterEach(() => {
    cleanup()
    Object.values(mocks).forEach((mock) => {
      mock.mockReset()
    })
  })

  const lastAck = () => {
    const call = mocks.timeoutEmit.mock.calls.at(-1)

    return call?.[2] as Ack
  }

  it("shows no success before the server confirms, and locks the row meanwhile", () => {
    render(<ConfigResults />)

    confirmDelete(0)

    expect(mocks.timeoutEmit).toHaveBeenCalledWith(
      EVENTS.RESULTS.DELETE,
      "r1",
      expect.any(Function),
    )
    expect(mocks.success).not.toHaveBeenCalled()
    expect(
      deleteButtons().every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true)
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /Capitals/ })
        .disabled,
    ).toBe(true)
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /Rivers/ })
        .disabled,
    ).toBe(false)
  })

  it("toasts success only on { ok: true } and re-enables the buttons", () => {
    render(<ConfigResults />)
    confirmDelete(0)

    act(() => lastAck()(null, { ok: true }))

    expect(mocks.success).toHaveBeenCalledWith("manager:result.deleted")
    expect(mocks.error).not.toHaveBeenCalled()
    expect(
      deleteButtons().every(
        (button) => !(button as HTMLButtonElement).disabled,
      ),
    ).toBe(true)
  })

  it("toasts the server's error key and re-enables the buttons", () => {
    render(<ConfigResults />)
    confirmDelete(1)

    act(() => lastAck()(null, { error: "errors:result.failedToDelete" }))

    expect(mocks.error).toHaveBeenCalledWith("errors:result.failedToDelete")
    expect(mocks.success).not.toHaveBeenCalled()
    expect(
      deleteButtons().every(
        (button) => !(button as HTMLButtonElement).disabled,
      ),
    ).toBe(true)
  })

  it("treats a missing answer as a failure", () => {
    render(<ConfigResults />)
    confirmDelete(0)

    act(() => lastAck()(new Error("operation has timed out")))

    expect(mocks.error).toHaveBeenCalledWith("errors:result.failedToDelete")
    expect(mocks.success).not.toHaveBeenCalled()
    expect(
      deleteButtons().every(
        (button) => !(button as HTMLButtonElement).disabled,
      ),
    ).toBe(true)
  })
})
