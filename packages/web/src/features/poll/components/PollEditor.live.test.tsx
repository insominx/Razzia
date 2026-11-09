import { EVENTS } from "@razzia/common/constants"
import type { PollWithId } from "@razzia/common/types/poll"
import PollEditor from "@razzia/web/features/poll/components/PollEditor"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  blockerOpts: null as unknown as { shouldBlockFn: () => boolean },
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit } }),
  useEvent: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useBlocker: (opts: { shouldBlockFn: () => boolean }) => {
    mocks.blockerOpts = opts

    return { status: "idle" }
  },
}))

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const stored = (extra: Partial<PollWithId> = {}): PollWithId => ({
  id: "poll-abcdef123456",
  question: "Which topic next?",
  options: ["Splines", "Physics"],
  anonymous: true,
  ...extra,
})

const liveSwitch = () =>
  screen.getByRole("switch", { name: "poll:editor.liveLabel" })

const fillNewPoll = () => {
  fireEvent.change(
    screen.getByRole("textbox", { name: "poll:editor.questionLabel" }),
    { target: { value: "Lunch?" } },
  )
  fireEvent.change(
    screen.getByRole("textbox", {
      name: 'poll:editor.optionPlaceholder:{"letter":"A"}',
    }),
    { target: { value: "Pizza" } },
  )
  fireEvent.change(
    screen.getByRole("textbox", {
      name: 'poll:editor.optionPlaceholder:{"letter":"B"}',
    }),
    { target: { value: "Soup" } },
  )
}

const save = () => {
  fireEvent.click(screen.getByRole("button", { name: "common:save" }))
}

const lastSaved = (event: string) =>
  mocks.emit.mock.calls.filter(([sent]) => sent === event).at(-1)?.[1] as
    | Record<string, unknown>
    | undefined

beforeEach(() => {
  mocks.emit.mockReset()
})

afterEach(cleanup)

describe("PollEditor results switch", () => {
  it("starts sealed: the switch is off and says results wait for the close", () => {
    render(<PollEditor />)

    expect(liveSwitch()).not.toBeChecked()
    expect(screen.getByText("poll:editor.liveOff")).toBeInTheDocument()
    expect(screen.queryByText("poll:editor.liveOn")).toBeNull()
  })

  it("sends no live field for a sealed poll", () => {
    render(<PollEditor />)
    fillNewPoll()
    save()

    expect(lastSaved(EVENTS.POLLS.SAVE)).not.toHaveProperty("live")
  })

  it("sends live: true once the switch is on, and shows the small-group caveat", () => {
    render(<PollEditor />)
    fillNewPoll()

    fireEvent.click(liveSwitch())
    expect(liveSwitch()).toBeChecked()
    expect(screen.getByText("poll:editor.liveOn")).toBeInTheDocument()

    save()

    expect(lastSaved(EVENTS.POLLS.SAVE)).toMatchObject({
      question: "Lunch?",
      anonymous: true,
      live: true,
    })
  })

  it("opens a live poll with the switch on, and a sealed one with it off", () => {
    const { unmount } = render(<PollEditor initial={stored({ live: true })} />)

    expect(liveSwitch()).toBeChecked()

    unmount()
    render(<PollEditor initial={stored()} />)

    expect(liveSwitch()).not.toBeChecked()
  })

  it("saves a live poll turned back to sealed without the field", () => {
    render(<PollEditor initial={stored({ live: true })} />)

    fireEvent.click(liveSwitch())
    save()

    expect(lastSaved(EVENTS.POLLS.UPDATE)).toEqual({
      id: "poll-abcdef123456",
      question: "Which topic next?",
      options: ["Splines", "Physics"],
      anonymous: true,
    })
  })

  it("counts the switch as an unsaved change, and undoing it as clean", () => {
    render(<PollEditor initial={stored()} />)

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(false)

    fireEvent.click(liveSwitch())
    expect(mocks.blockerOpts.shouldBlockFn()).toBe(true)

    fireEvent.click(liveSwitch())
    expect(mocks.blockerOpts.shouldBlockFn()).toBe(false)
  })

  it("keeps the anonymity line free of the live-count caveat", () => {
    render(<PollEditor />)

    expect(screen.getByText("poll:editor.anonymousOn")).toBeInTheDocument()
  })
})
