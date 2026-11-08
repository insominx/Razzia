import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import type { ManagerConfig } from "@razzia/common/types/manager"
import type { PollSnapshot } from "@razzia/common/types/poll"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import HostPollLauncher from "@razzia/web/features/poll/components/HostPollLauncher"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { ACK_TIMEOUT_MS } from "@razzia/web/features/poll/utils/emit-with-ack"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  embed: false,
  emit: vi.fn(),
  toastError: vi.fn(),
  handlers: new Map<string, (_payload?: unknown) => void>(),
}))

vi.mock("@razzia/web/features/deck/embed", () => ({
  get IS_DECK_EMBED() {
    return mocks.embed
  },
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit } }),
  useEvent: (event: string, handler: (_payload?: unknown) => void) => {
    mocks.handlers.set(event, handler)
  },
}))

vi.mock("react-hot-toast", () => ({
  default: { error: mocks.toastError },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

type Ack = (_outcome: string) => void

const config = (polls: ManagerConfig["polls"]): ManagerConfig => ({
  quizz: [],
  polls,
  pollResults: [],
  results: [],
  game: { resolvedVisuals: {} },
})

const lunch = {
  id: "lunch",
  question: "What should we eat?",
  optionCount: 3,
  anonymous: true,
}

const named = {
  id: "named",
  question: "Who presents first?",
  optionCount: 2,
  anonymous: false,
}

const lectureState = {
  inviteCode: "123456",
  total: 2,
  played: [0],
  current: 0,
  finished: false,
}

const room = (
  screenName: string = STATUS.SHOW_RESPONSES,
  extra: Partial<ReturnType<typeof useManagerStore.getState>> = {},
) => {
  useManagerStore.setState({
    gameId: "g1",
    lecture: lectureState,
    hostControls: true,
    status: { name: screenName, data: {} } as never,
    config: config([lunch, named]),
    ...extra,
  })
}

const maybeLauncher = () =>
  screen.queryByRole("button", { name: "poll:launcher.button" })

const launcher = () => {
  const element = maybeLauncher()

  if (!element) {
    throw new Error("The launcher is not on screen.")
  }

  return element
}

// A click, and the microtask in which the server's answer is acted on.
const tap = async (element: Element) => {
  await act(async () => {
    fireEvent.click(element)
    await Promise.resolve()
  })
}

const answerWith = (outcome: string) => {
  mocks.emit.mockImplementation(
    (event: string, _payload: unknown, ack?: Ack) => {
      if (event === EVENTS.MANAGER.START_POLL) {
        ack?.(outcome)
      }
    },
  )
}

const startsSent = () =>
  mocks.emit.mock.calls.filter(([event]) => event === EVENTS.MANAGER.START_POLL)

beforeEach(() => {
  mocks.embed = false
  mocks.emit.mockReset()
  mocks.toastError.mockReset()
  mocks.handlers.clear()
  usePollStore.getState().reset()
  useManagerStore.getState().reset()
  useManagerStore.setState({ hostControls: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("HostPollLauncher availability", () => {
  it.each([STATUS.SHOW_ROOM, STATUS.SHOW_RESPONSES, STATUS.SHOW_LEADERBOARD])(
    "is offered on %s of a lecture room",
    (screenName) => {
      room(screenName)
      render(<HostPollLauncher />)

      expect(maybeLauncher()).toBeInTheDocument()
    },
  )

  it.each([
    STATUS.SHOW_START,
    STATUS.SHOW_PREPARED,
    STATUS.SHOW_QUESTION,
    STATUS.SELECT_ANSWER,
    STATUS.FINISHED,
  ])("is not offered on %s", (screenName) => {
    room(screenName)
    render(<HostPollLauncher />)

    expect(maybeLauncher()).toBeNull()
  })

  it("is not offered in a normal game", () => {
    room(STATUS.SHOW_ROOM, { lecture: null })
    render(<HostPollLauncher />)

    expect(maybeLauncher()).toBeNull()
  })

  it("is not offered once the lecture has finished", () => {
    room(STATUS.SHOW_RESPONSES, {
      lecture: { ...lectureState, played: [0, 1], current: 1, finished: true },
    })
    render(<HostPollLauncher />)

    expect(maybeLauncher()).toBeNull()
  })

  it("is not offered when the host's controls are hidden", () => {
    room(STATUS.SHOW_RESPONSES, { hostControls: false })
    render(<HostPollLauncher />)

    expect(maybeLauncher()).toBeNull()
  })

  it("is not offered in a lecture deck", () => {
    room(STATUS.SHOW_RESPONSES)
    mocks.embed = true
    render(<HostPollLauncher />)

    expect(maybeLauncher()).toBeNull()
  })

  it("is not offered without a game", () => {
    room(STATUS.SHOW_RESPONSES, { gameId: null })
    render(<HostPollLauncher />)

    expect(maybeLauncher()).toBeNull()
  })

  it("is not offered while a poll is showing", () => {
    room(STATUS.SHOW_RESPONSES)
    usePollStore
      .getState()
      .apply({ pollId: "lunch", phase: "open" } as PollSnapshot)
    render(<HostPollLauncher />)

    expect(maybeLauncher()).toBeNull()
  })

  it("goes away, closing its list, when the room moves on to a question", () => {
    room(STATUS.SHOW_RESPONSES)
    render(<HostPollLauncher />)
    fireEvent.click(launcher())
    expect(screen.getByRole("menu")).toBeInTheDocument()

    act(() => {
      room(STATUS.SELECT_ANSWER)
    })

    expect(maybeLauncher()).toBeNull()
    expect(screen.queryByRole("menu")).toBeNull()
  })
})

describe("HostPollLauncher list", () => {
  it("opens on a click, asks for the polls fresh, and lists them", () => {
    room()
    render(<HostPollLauncher />)

    fireEvent.click(launcher())

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.MANAGER.GET_CONFIG)
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      'What should we eat?poll:launcher.options:{"count":3} · poll:launcher.anonymous',
      'Who presents first?poll:launcher.options:{"count":2} · poll:launcher.named',
    ])
  })

  it("keeps the config the server sends back", () => {
    room()
    render(<HostPollLauncher />)

    act(() => {
      mocks.handlers.get(EVENTS.MANAGER.CONFIG)?.(config([named]))
    })
    fireEvent.click(launcher())

    expect(screen.getAllByRole("menuitem")).toHaveLength(1)
  })

  it("says when there are no polls yet", () => {
    room(STATUS.SHOW_RESPONSES, { config: config([]) })
    render(<HostPollLauncher />)

    fireEvent.click(launcher())

    expect(screen.getByText("poll:launcher.empty")).toBeInTheDocument()
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0)
  })

  it("says so too before the config has arrived", () => {
    room(STATUS.SHOW_RESPONSES, { config: null })
    render(<HostPollLauncher />)

    fireEvent.click(launcher())

    expect(screen.getByText("poll:launcher.empty")).toBeInTheDocument()
  })

  it("closes on Escape", () => {
    room()
    render(<HostPollLauncher />)

    fireEvent.click(launcher())
    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("closes on a click elsewhere, but not on a click inside the list", () => {
    room()
    render(
      <div>
        <HostPollLauncher />
        <p>elsewhere</p>
      </div>,
    )

    fireEvent.click(launcher())
    fireEvent.mouseDown(screen.getByRole("menu"))
    expect(screen.getByRole("menu")).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByText("elsewhere"))
    expect(screen.queryByRole("menu")).toBeNull()
  })
})

describe("HostPollLauncher starting a poll", () => {
  const openList = () => {
    room()
    render(<HostPollLauncher />)
    fireEvent.click(launcher())
  }

  it("starts the chosen poll in this game, and closes the list", async () => {
    answerWith("accepted")
    openList()

    await tap(screen.getByRole("menuitem", { name: /What should we eat/u }))

    expect(mocks.emit).toHaveBeenCalledWith(
      EVENTS.MANAGER.START_POLL,
      { gameId: "g1", pollId: "lunch" },
      expect.any(Function),
    )
    expect(screen.queryByRole("menu")).toBeNull()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it.each(["busy", "notFound", "notLecture", "notManager", "none"])(
    "says why when the server answers %s, and leaves the list open",
    async (outcome) => {
      answerWith(outcome)
      openList()

      await tap(screen.getAllByRole("menuitem")[0])

      expect(mocks.toastError).toHaveBeenCalledWith(
        `poll:outcome.${outcome}`,
        expect.anything(),
      )
      expect(screen.getByRole("menu")).toBeInTheDocument()
    },
  )

  it("asks for the list again when the poll turns out to be gone", async () => {
    answerWith("notFound")
    openList()
    mocks.emit.mockClear()
    answerWith("notFound")

    await tap(screen.getAllByRole("menuitem")[0])

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.MANAGER.GET_CONFIG)
  })

  it("sends one start while the first is waiting", () => {
    openList()

    fireEvent.click(screen.getAllByRole("menuitem")[0])
    fireEvent.click(screen.getAllByRole("menuitem")[1])

    expect(startsSent()).toHaveLength(1)
    expect(screen.getAllByRole("menuitem")[0]).toBeDisabled()
    expect(screen.getAllByRole("menuitem")[1]).toBeDisabled()
  })

  it("unlocks and says so when the server never answers", async () => {
    vi.useFakeTimers()
    openList()

    fireEvent.click(screen.getAllByRole("menuitem")[0])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS)
    })

    expect(mocks.toastError).toHaveBeenCalledWith(
      "poll:outcome.noAck",
      expect.anything(),
    )
    expect(screen.getAllByRole("menuitem")[0]).toBeEnabled()
  })
})
