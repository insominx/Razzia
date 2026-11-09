import { EVENTS } from "@razzia/common/constants"
import ConfigManageQuizz from "@razzia/web/features/manager/components/configurations/ConfigManageQuizz"
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Ack = (error: Error | null, response?: unknown) => void

const list = vi.hoisted(() => ({
  quizz: [] as Array<{ id: string; subject: string; seedState?: string }>,
}))

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
  useConfig: () => ({ quizz: list.quizz }),
}))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))

vi.mock("react-hot-toast", () => ({
  default: { success: mocks.success, error: mocks.error },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const plainList = () => [
  { id: "q1", subject: "Capitals" },
  { id: "q2", subject: "Rivers" },
]

beforeEach(() => {
  list.quizz = plainList()
})

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

  const json = (body: object) =>
    new File([JSON.stringify(body)], "quiz.json", { type: "application/json" })

  it("names each import, so the server can tell a repeat from a new quiz", async () => {
    const { container } = render(<ConfigManageQuizz />)

    pick(container, json({ subject: "Imported" }))
    pick(container, json({ subject: "Imported" }))

    await waitFor(() => {
      expect(mocks.emit).toHaveBeenCalledTimes(2)
    })

    const sent = mocks.emit.mock.calls as Array<
      [string, { subject: string; id: string }]
    >

    expect(sent[0][0]).toBe(EVENTS.QUIZZ.SAVE)
    expect(sent[0][1].subject).toBe("Imported")
    expect(sent[0][1].id).toMatch(/^quizz-[0-9a-f]{24}$/u)
    expect(sent[1][1].id).not.toBe(sent[0][1].id)
  })

  it("names the import itself, whatever id the file carries", async () => {
    const { container } = render(<ConfigManageQuizz />)

    pick(container, json({ subject: "Imported", id: "someone-elses-quiz" }))

    await waitFor(() => {
      expect(mocks.emit).toHaveBeenCalledTimes(1)
    })

    const [, payload] = mocks.emit.mock.calls[0] as [string, { id: string }]

    expect(payload.id).toMatch(/^quizz-/u)
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

describe("ConfigManageQuizz shipped versions", () => {
  beforeEach(() => {
    mocks.timeout.mockReturnValue({ emit: mocks.timeoutEmit })
    list.quizz = [
      { id: "q1", subject: "Capitals", seedState: "edited" },
      { id: "q2", subject: "Rivers", seedState: "committed" },
      { id: "q3", subject: "Mine" },
    ]
  })

  afterEach(() => {
    cleanup()
    Object.values(mocks).forEach((mock) => {
      mock.mockReset()
    })
  })

  const restoreButtons = () =>
    screen.queryAllByRole("button", { name: "manager:quizz.restore" })

  it("marks only an edited quiz, explains it, and offers the restore button only there", () => {
    render(<ConfigManageQuizz />)

    expect(screen.getAllByText("manager:quizz.edited")).toHaveLength(1)
    expect(screen.getByTestId("seed-note").textContent).toBe(
      "manager:quizz.editedNote",
    )
    expect(restoreButtons()).toHaveLength(1)
  })

  it("shows no note, badge or button when nothing was edited", () => {
    list.quizz = [
      { id: "q2", subject: "Rivers", seedState: "committed" },
      { id: "q3", subject: "Mine" },
    ]
    render(<ConfigManageQuizz />)

    expect(screen.queryByTestId("seed-note")).toBeNull()
    expect(screen.queryByText("manager:quizz.edited")).toBeNull()
    expect(restoreButtons()).toHaveLength(0)
  })

  it("asks before it restores, and says what will be lost", () => {
    render(<ConfigManageQuizz />)

    fireEvent.click(restoreButtons()[0])

    expect(
      within(screen.getByRole("alertdialog")).getByText(
        "manager:quizz.restoreConfirm",
      ),
    ).toBeTruthy()
    expect(mocks.timeoutEmit).not.toHaveBeenCalled()
  })

  it("restores through the server, toasts success only once it confirms", () => {
    render(<ConfigManageQuizz />)
    fireEvent.click(restoreButtons()[0])
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "manager:quizz.restoreAction",
      }),
    )

    expect(mocks.timeoutEmit).toHaveBeenCalledWith(
      EVENTS.QUIZZ.RESTORE,
      "q1",
      expect.any(Function),
    )
    expect(mocks.success).not.toHaveBeenCalled()

    const ack = mocks.timeoutEmit.mock.calls.at(-1)?.[2] as Ack

    act(() => ack(null, { ok: true }))

    expect(mocks.success).toHaveBeenCalledWith("manager:quizz.restored")
  })

  it("shows the server's error key when the restore fails", () => {
    render(<ConfigManageQuizz />)
    fireEvent.click(restoreButtons()[0])
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "manager:quizz.restoreAction",
      }),
    )
    const ack = mocks.timeoutEmit.mock.calls.at(-1)?.[2] as Ack

    act(() => ack(null, { error: "errors:quizz.noCommittedVersion" }))

    expect(mocks.error).toHaveBeenCalledWith("errors:quizz.noCommittedVersion")
    expect(mocks.success).not.toHaveBeenCalled()
  })
})
