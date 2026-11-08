import { EVENTS } from "@razzia/common/constants"
import type {
  PollMeta,
  PollResultMeta,
  PollResultRecord,
} from "@razzia/common/types/poll"
import ConfigManagePolls from "@razzia/web/features/manager/components/configurations/ConfigManagePolls"
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

const list = vi.hoisted(() => ({
  polls: [] as PollMeta[],
  pollResults: [] as PollResultMeta[],
}))

const mocks = vi.hoisted(() => {
  const emit = vi.fn()
  const timeout = vi.fn()

  return {
    navigate: vi.fn(),
    emit,
    timeoutEmit: vi.fn(),
    timeout,
    // The same object every render, as the real client is.
    socket: { emit, timeout },
    success: vi.fn(),
    error: vi.fn(),
    handlers: new Map<string, (_payload?: unknown) => void>(),
  }
})

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: mocks.socket }),
  useEvent: (event: string, handler: (_payload?: unknown) => void) => {
    mocks.handlers.set(event, handler)
  },
}))

vi.mock("@razzia/web/features/manager/contexts/config-context", () => ({
  useConfig: () => ({ polls: list.polls, pollResults: list.pollResults }),
}))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }))

vi.mock("react-hot-toast", () => ({
  default: { success: mocks.success, error: mocks.error },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const lunch: PollMeta = {
  id: "lunch",
  question: "What should we eat?",
  optionCount: 3,
  anonymous: true,
}

const named: PollMeta = {
  id: "named",
  question: "Who presents first?",
  optionCount: 2,
  anonymous: false,
}

const finished: PollResultMeta = {
  id: "r1",
  pollId: "lunch",
  question: "What should we eat?",
  date: "2026-11-08T12:30:00.000Z",
  gameSubject: "Lecture 4",
  total: 12,
  anonymous: true,
}

const early: PollResultMeta = {
  id: "r2",
  pollId: "named",
  question: "Who presents first?",
  date: "2026-11-01T09:00:00.000Z",
  gameSubject: "Lecture 3",
  total: 1,
  anonymous: false,
  partial: true,
}

const record: PollResultRecord = {
  id: "r1",
  pollId: "lunch",
  question: "What should we eat?",
  options: ["Pizza", "Soup", "Salad"],
  anonymous: true,
  date: "2026-11-08T12:30:00.000Z",
  gameSubject: "Lecture 4",
  counts: [7, 3, 2],
  total: 12,
}

const rows = () => [...document.querySelectorAll("[data-poll-row]")]

const resultRows = () => [...document.querySelectorAll("[data-poll-result]")]

const confirmDelete = (index: number) => {
  fireEvent.click(
    screen.getAllByRole("button", { name: "common:delete" })[index],
  )
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "common:delete",
    }),
  )
}

const confirmDeleteResult = (index: number) => {
  fireEvent.click(
    screen.getAllByRole("button", { name: "manager:polls.resultDelete" })[
      index
    ],
  )
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "common:delete",
    }),
  )
}

const lastAck = () => mocks.timeoutEmit.mock.calls.at(-1)?.[2] as Ack

const deleteButtons = () =>
  screen.getAllByRole("button", { name: "common:delete" })

beforeEach(() => {
  list.polls = [lunch, named]
  list.pollResults = []
  mocks.timeout.mockReturnValue({ emit: mocks.timeoutEmit })
})

afterEach(() => {
  cleanup()
  Object.values(mocks).forEach((mock) => {
    if (typeof mock === "function" && "mockReset" in mock) {
      mock.mockReset()
    }
  })
  mocks.handlers.clear()
})

describe("ConfigManagePolls list", () => {
  it("asks for the server's config once when the tab opens", () => {
    const { rerender } = render(<ConfigManagePolls />)

    expect(mocks.emit).toHaveBeenCalledExactlyOnceWith(
      EVENTS.MANAGER.GET_CONFIG,
    )

    // Showing new data is not a reason to ask again.
    list.pollResults = [finished]
    rerender(<ConfigManagePolls />)

    expect(mocks.emit).toHaveBeenCalledTimes(1)
  })

  it("lists each poll with its options and who sees the votes", () => {
    render(<ConfigManagePolls />)

    expect(rows().map((row) => row.textContent)).toEqual([
      'What should we eat?poll:launcher.options:{"count":3} · poll:launcher.anonymous',
      'Who presents first?poll:launcher.options:{"count":2} · poll:launcher.named',
    ])
  })

  it("says when there are no polls yet", () => {
    list.polls = []
    render(<ConfigManagePolls />)

    expect(screen.getByText("manager:polls.none")).toBeInTheDocument()
    expect(rows()).toHaveLength(0)
  })

  it("starts a new poll", () => {
    render(<ConfigManagePolls />)

    fireEvent.click(
      screen.getByRole("button", { name: "manager:polls.create" }),
    )

    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/manager/polls" })
  })

  it("opens a poll to edit it", () => {
    render(<ConfigManagePolls />)

    fireEvent.click(
      within(rows()[1] as HTMLElement).getByRole("button", {
        name: "poll:editor.editTitle",
      }),
    )

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/polls/$pollId",
      params: { pollId: "named" },
    })
  })

  it("shows what the server says went wrong", () => {
    render(<ConfigManagePolls />)

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.ERROR)?.("errors:poll.notFound")
    })

    expect(mocks.error).toHaveBeenCalledWith("errors:poll.notFound")
  })
})

describe("ConfigManagePolls deleting", () => {
  it("asks first, naming the poll, and sends nothing until confirmed", () => {
    render(<ConfigManagePolls />)

    fireEvent.click(deleteButtons()[0])

    expect(
      within(screen.getByRole("alertdialog")).getByText(
        'manager:polls.deleteConfirm:{"name":"What should we eat?"}',
      ),
    ).toBeInTheDocument()
    expect(mocks.timeoutEmit).not.toHaveBeenCalled()
  })

  it("deletes the poll asked for, and locks the buttons until the server answers", () => {
    render(<ConfigManagePolls />)

    confirmDelete(1)

    expect(mocks.timeoutEmit).toHaveBeenCalledWith(
      EVENTS.POLLS.DELETE,
      "named",
      expect.any(Function),
    )
    expect(mocks.success).not.toHaveBeenCalled()
    expect(
      deleteButtons().every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true)
  })

  it("says so only when the server confirms, and unlocks", () => {
    render(<ConfigManagePolls />)
    confirmDelete(0)

    act(() => lastAck()(null, { ok: true }))

    expect(mocks.success).toHaveBeenCalledWith("manager:polls.deleted")
    expect(mocks.error).not.toHaveBeenCalled()
    expect(
      deleteButtons().every(
        (button) => !(button as HTMLButtonElement).disabled,
      ),
    ).toBe(true)
  })

  it("shows the server's error key and unlocks", () => {
    render(<ConfigManagePolls />)
    confirmDelete(0)

    act(() => lastAck()(null, { error: "errors:poll.failedToDelete" }))

    expect(mocks.error).toHaveBeenCalledWith("errors:poll.failedToDelete")
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it("treats an answer that never came as a failure", () => {
    render(<ConfigManagePolls />)
    confirmDelete(0)

    act(() => lastAck()(new Error("operation has timed out")))

    expect(mocks.error).toHaveBeenCalledWith("errors:poll.failedToDelete")
    expect(mocks.success).not.toHaveBeenCalled()
  })
})

describe("ConfigManagePolls results", () => {
  beforeEach(() => {
    list.pollResults = [finished, early]
  })

  it("has no results section until a poll has been run", () => {
    list.pollResults = []
    render(<ConfigManagePolls />)

    expect(resultRows()).toHaveLength(0)
    expect(screen.queryByText("manager:polls.resultsTitle")).toBeNull()
  })

  it("lists what the polls left behind, with when, how many voted, and an early end", () => {
    render(<ConfigManagePolls />)

    expect(screen.getByText("manager:polls.resultsTitle")).toBeInTheDocument()
    expect(resultRows()).toHaveLength(2)
    expect(resultRows()[0].textContent).toContain(
      'manager:polls.resultVotes:{"count":12}',
    )
    expect(resultRows()[0].querySelector("[data-partial]")).toBeNull()
    expect(resultRows()[1].querySelector("[data-partial]")).toHaveTextContent(
      "manager:polls.resultPartial",
    )
  })

  it("asks for a result when it is clicked, and shows it when it arrives", () => {
    render(<ConfigManagePolls />)

    fireEvent.click(
      within(resultRows()[0] as HTMLElement).getAllByRole("button")[0],
    )

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.POLLS.RESULT_GET, "r1")
    expect(screen.queryByRole("dialog")).toBeNull()

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.RESULT_DATA)?.(record)
    })

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "What should we eat?",
    )
  })

  it("closes the result with its close button and with Escape", () => {
    render(<ConfigManagePolls />)
    act(() => {
      mocks.handlers.get(EVENTS.POLLS.RESULT_DATA)?.(record)
    })

    fireEvent.click(screen.getByRole("button", { name: "poll:result.close" }))
    expect(screen.queryByRole("dialog")).toBeNull()

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.RESULT_DATA)?.(record)
    })
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("asks before deleting a result, naming it", () => {
    render(<ConfigManagePolls />)

    fireEvent.click(
      screen.getAllByRole("button", { name: "manager:polls.resultDelete" })[0],
    )

    expect(
      within(screen.getByRole("alertdialog")).getByText(
        'manager:polls.resultDeleteConfirm:{"name":"What should we eat?"}',
      ),
    ).toBeInTheDocument()
    expect(mocks.timeoutEmit).not.toHaveBeenCalled()
  })

  it("deletes the result asked for, and says so only when the server confirms", () => {
    render(<ConfigManagePolls />)

    confirmDeleteResult(1)

    expect(mocks.timeoutEmit).toHaveBeenCalledWith(
      EVENTS.POLLS.RESULT_DELETE,
      "r2",
      expect.any(Function),
    )
    expect(mocks.success).not.toHaveBeenCalled()

    act(() => lastAck()(null, { ok: true }))

    expect(mocks.success).toHaveBeenCalledWith("manager:polls.resultDeleted")
  })

  it("shows the server's error key, or a generic one when no answer came", () => {
    render(<ConfigManagePolls />)
    confirmDeleteResult(0)

    act(() => lastAck()(null, { error: "errors:poll.failedToDeleteResult" }))

    expect(mocks.error).toHaveBeenCalledWith("errors:poll.failedToDeleteResult")

    confirmDeleteResult(0)
    act(() => lastAck()(new Error("operation has timed out")))

    expect(mocks.error).toHaveBeenLastCalledWith(
      "errors:poll.failedToDeleteResult",
    )
    expect(mocks.success).not.toHaveBeenCalled()
  })
})
