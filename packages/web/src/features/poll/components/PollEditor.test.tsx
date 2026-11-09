import { EVENTS } from "@razzia/common/constants"
import type { PollWithId } from "@razzia/common/types/poll"
import PollEditor from "@razzia/web/features/poll/components/PollEditor"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  handlers: new Map<string, (_payload?: unknown) => void>(),
  blocker: { status: "idle" } as Record<string, unknown>,
  blockerOpts: null as unknown as { shouldBlockFn: () => boolean },
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit } }),
  useEvent: (event: string, handler: (_payload?: unknown) => void) => {
    mocks.handlers.set(event, handler)
  },
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useBlocker: (opts: { shouldBlockFn: () => boolean }) => {
    mocks.blockerOpts = opts

    return mocks.blocker
  },
}))

vi.mock("react-hot-toast", () => ({
  default: { success: mocks.toastSuccess, error: mocks.toastError },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const stored: PollWithId = {
  id: "poll-abcdef123456",
  question: "Which topic next?",
  options: ["Splines", "Physics", "Networking"],
  anonymous: false,
}

const questionBox = () =>
  screen.getByRole("textbox", { name: "poll:editor.questionLabel" })

const optionBox = (index: number) =>
  screen.getByRole("textbox", {
    name: `poll:editor.optionPlaceholder:{"letter":"${"ABCDEF"[index]}"}`,
  })

const optionBoxes = () =>
  screen
    .getAllByRole("textbox")
    .filter((box) => box.tagName === "INPUT") as HTMLInputElement[]

const saveButton = () => screen.getByRole("button", { name: "common:save" })

const addButton = () =>
  screen.getByRole("button", { name: /poll:editor.addOption/u })

const removeButton = (index: number) =>
  screen.getByRole("button", {
    name: `poll:editor.removeOption:{"letter":"${"ABCDEF"[index]}"}`,
  })

const type = (box: HTMLElement, value: string) => {
  fireEvent.change(box, { target: { value } })
}

const fillNewPoll = () => {
  type(questionBox(), "  Lunch?  ")
  type(optionBox(0), "Pizza")
  type(optionBox(1), "Soup")
}

const savesSent = (event: string) =>
  mocks.emit.mock.calls.filter(([sent]) => sent === event)

beforeEach(() => {
  mocks.emit.mockReset()
  mocks.navigate.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.toastError.mockReset()
  mocks.handlers.clear()
  mocks.blocker = { status: "idle" }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("PollEditor starting a poll", () => {
  it("opens empty, with two options and anonymous votes", () => {
    render(<PollEditor />)

    expect(screen.getByText("poll:editor.newTitle")).toBeInTheDocument()
    expect(questionBox()).toHaveValue("")
    expect(optionBoxes()).toHaveLength(2)
    expect(screen.getByRole("switch")).toBeChecked()
    expect(screen.getByText("poll:editor.anonymousOn")).toBeInTheDocument()
  })

  it("opens a stored poll as it was saved", () => {
    render(<PollEditor initial={stored} />)

    expect(screen.getByText("poll:editor.editTitle")).toBeInTheDocument()
    expect(questionBox()).toHaveValue("Which topic next?")
    expect(optionBoxes().map((box) => box.value)).toEqual([
      "Splines",
      "Physics",
      "Networking",
    ])
    expect(screen.getByRole("switch")).not.toBeChecked()
    expect(screen.getByText("poll:editor.anonymousOff")).toBeInTheDocument()
  })

  it("limits what can be typed to what the server takes", () => {
    render(<PollEditor />)

    expect(questionBox()).toHaveAttribute("maxlength", "500")
    expect(optionBox(0)).toHaveAttribute("maxlength", "200")
  })
})

describe("PollEditor options", () => {
  it("adds options up to six, then stops offering to", () => {
    render(<PollEditor />)

    for (let count = 2; count < 6; count += 1) {
      fireEvent.click(addButton())
    }

    expect(optionBoxes()).toHaveLength(6)
    expect(addButton()).toBeDisabled()
  })

  it("removes options down to two, then stops offering to", () => {
    render(<PollEditor initial={stored} />)

    fireEvent.click(removeButton(2))

    expect(optionBoxes()).toHaveLength(2)
    expect(removeButton(0)).toBeDisabled()
    expect(removeButton(1)).toBeDisabled()
  })

  it("removes the option that was asked for, and keeps what the others say", () => {
    render(<PollEditor initial={stored} />)

    fireEvent.click(removeButton(1))

    expect(optionBoxes().map((box) => box.value)).toEqual([
      "Splines",
      "Networking",
    ])
  })

  it("letters the options in order", () => {
    render(<PollEditor initial={stored} />)

    expect(
      [...document.querySelectorAll("li > span[aria-hidden]")].map(
        (letter) => letter.textContent,
      ),
    ).toEqual(["A", "B", "C"])
  })
})

describe("PollEditor saving", () => {
  it("saves a new poll under a name it chose, trimmed and validated", () => {
    render(<PollEditor />)
    fillNewPoll()

    fireEvent.click(saveButton())

    expect(mocks.emit).toHaveBeenCalledTimes(1)

    const sent = savesSent(EVENTS.POLLS.SAVE).map(
      ([, payload]) => payload as { id: string },
    )
    const [{ id, ...poll }] = sent

    expect(id).toMatch(/^poll-[0-9a-f]{24}$/u)
    expect(poll).toEqual({
      question: "Lunch?",
      options: ["Pizza", "Soup"],
      anonymous: true,
    })
  })

  it("sends who sees what as the author set it", () => {
    render(<PollEditor />)
    fillNewPoll()

    fireEvent.click(screen.getByRole("switch"))
    expect(screen.getByText("poll:editor.anonymousOff")).toBeInTheDocument()
    fireEvent.click(saveButton())

    expect(mocks.emit).toHaveBeenCalledWith(
      EVENTS.POLLS.SAVE,
      expect.objectContaining({ anonymous: false }),
    )
  })

  it("sends one save while the first is waiting, and the same name on a retry", () => {
    render(<PollEditor />)
    fillNewPoll()

    fireEvent.click(saveButton())
    fireEvent.click(saveButton())
    expect(savesSent(EVENTS.POLLS.SAVE)).toHaveLength(1)
    expect(saveButton()).toBeDisabled()

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.ERROR)?.("errors:poll.failedToSave")
    })
    fireEvent.click(saveButton())

    const [[, first], [, second]] = savesSent(EVENTS.POLLS.SAVE) as Array<
      [string, { id: string }]
    >

    expect(second.id).toBe(first.id)
  })

  it("updates a stored poll under its own name", () => {
    render(<PollEditor initial={stored} />)
    type(optionBox(0), "Curves")

    fireEvent.click(saveButton())

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.POLLS.UPDATE, {
      id: "poll-abcdef123456",
      question: "Which topic next?",
      options: ["Curves", "Physics", "Networking"],
      anonymous: false,
    })
    expect(savesSent(EVENTS.POLLS.SAVE)).toHaveLength(0)
  })

  it("goes back to the manager, saying so, when the server has saved it", () => {
    render(<PollEditor />)
    fillNewPoll()

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.SAVE_SUCCESS)?.({ id: "poll-x" })
    })

    expect(mocks.toastSuccess).toHaveBeenCalledWith("poll:editor.saved")
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      ignoreBlocker: true,
    })
  })

  it("says it was updated when a stored poll is saved", () => {
    render(<PollEditor initial={stored} />)

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.UPDATE_SUCCESS)?.({ id: stored.id })
    })

    expect(mocks.toastSuccess).toHaveBeenCalledWith("poll:editor.updated")
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      ignoreBlocker: true,
    })
  })

  it("tells the host what the server refused, and lets them try again", () => {
    render(<PollEditor />)
    fillNewPoll()
    fireEvent.click(saveButton())

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.ERROR)?.("errors:poll.failedToSave")
    })

    expect(mocks.toastError).toHaveBeenCalledWith("errors:poll.failedToSave")
    expect(saveButton()).toBeEnabled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it("lets the host try again when the server never answers", () => {
    vi.useFakeTimers()
    render(<PollEditor />)
    fillNewPoll()

    fireEvent.click(saveButton())
    expect(saveButton()).toBeDisabled()

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(saveButton()).toBeEnabled()
  })
})

describe("PollEditor mistakes", () => {
  it("names a mistake in the same words the server would, and sends nothing", () => {
    render(<PollEditor />)

    fireEvent.click(saveButton())

    expect(screen.getByRole("alert")).toHaveTextContent(
      "errors:poll.questionEmpty",
    )
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  it("says so about an empty option and about two that are the same", () => {
    render(<PollEditor />)
    type(questionBox(), "Lunch?")
    type(optionBox(0), "Pizza")

    fireEvent.click(saveButton())
    expect(screen.getByRole("alert")).toHaveTextContent(
      "errors:poll.optionEmpty",
    )

    type(optionBox(1), "pizza")
    fireEvent.click(saveButton())
    expect(screen.getByRole("alert")).toHaveTextContent(
      "errors:poll.duplicateOption",
    )
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  it("does not nag before the first try to save", () => {
    render(<PollEditor />)

    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("PollEditor fit warning", () => {
  it("is quiet for a short poll", () => {
    render(<PollEditor />)
    fillNewPoll()

    expect(document.querySelector("[data-fit-warning]")).toBeNull()
  })

  it("warns that a poll with a great deal of text may not fit the projector", () => {
    render(<PollEditor />)
    type(
      questionBox(),
      "Which of these would you most like us to do? ".repeat(4),
    )
    for (let count = 2; count < 6; count += 1) {
      fireEvent.click(addButton())
    }
    optionBoxes().forEach((box) => {
      type(
        box,
        "A long option that goes on and on about nothing at all. ".repeat(2),
      )
    })

    expect(
      document.querySelector("[data-fit-warning='stage']"),
    ).toHaveTextContent("poll:editor.fitWarning")
  })
})

describe("PollEditor leaving", () => {
  it("leaves at once when nothing has changed", () => {
    render(<PollEditor initial={stored} />)

    fireEvent.click(screen.getByRole("button", { name: "common:exit" }))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      ignoreBlocker: true,
    })
    expect(mocks.blockerOpts.shouldBlockFn()).toBe(false)
  })

  it("asks before throwing away edits, and leaves only when told to", () => {
    render(<PollEditor initial={stored} />)
    type(questionBox(), "Something else?")

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "common:exit" }))

    const dialog = screen.getByRole("alertdialog")

    expect(
      within(dialog).getByText("poll:editor.unsaved.title"),
    ).toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalled()

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "poll:editor.unsaved.discard",
      }),
    )

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      ignoreBlocker: true,
    })
  })

  it("reads retyping the original text as no change at all", () => {
    render(<PollEditor initial={stored} />)

    type(questionBox(), "Changed")
    type(questionBox(), "Which topic next?")

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(false)
  })

  it("asks before the tab is closed with unsaved edits, and not otherwise", () => {
    render(<PollEditor initial={stored} />)

    const clean = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)

    type(questionBox(), "Changed")

    const dirty = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
  })

  it("shows the leave prompt a blocked route asks for, and proceeds on confirm", () => {
    const proceed = vi.fn()
    const reset = vi.fn()

    mocks.blocker = { status: "blocked", proceed, reset }
    render(<PollEditor initial={stored} />)

    const dialog = screen.getByRole("alertdialog")
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "poll:editor.unsaved.discard",
      }),
    )

    expect(proceed).toHaveBeenCalledTimes(1)
  })
})
