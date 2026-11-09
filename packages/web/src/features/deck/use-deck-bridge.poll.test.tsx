import { EVENTS } from "@razzia/common/constants"
import type { LectureState } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import type { ManagerConfig } from "@razzia/common/types/manager"
import type { PollSnapshot } from "@razzia/common/types/poll"
import type { BridgeMessage } from "@razzia/web/features/deck/protocol"
import { useDeckBridge } from "@razzia/web/features/deck/use-deck-bridge"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const DECK = "http://localhost:8776"

type Handler = (..._args: never[]) => void
type Ack = (_error: Error | null, _outcome?: string) => void

const mocks = vi.hoisted(() => {
  const ackEmit = vi.fn()

  return {
    handlers: new Map<string, Handler>(),
    navigate: vi.fn(),
    setSuppressed: vi.fn(),
    router: { pathname: "/manager" },
    ackEmit,
    socket: { emit: vi.fn(), timeout: vi.fn(() => ({ emit: ackEmit })) },
  }
})

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: mocks.socket, isConnected: true }),
  useEvent: (event: string, callback: Handler) => {
    mocks.handlers.set(event, callback)
  },
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouterState: ({
    select,
  }: {
    select: (_state: { location: { pathname: string } }) => string
  }) => select({ location: { pathname: mocks.router.pathname } }),
}))

vi.mock("@razzia/web/features/game/stores/sound", () => ({
  useSoundStore: {
    getState: () => ({ setSuppressed: mocks.setSuppressed }),
  },
}))

const config = {
  quizz: [],
  results: [],
  game: { visuals: {}, resolvedVisuals: {} },
} as unknown as ManagerConfig

const lectureState = (overrides: Partial<LectureState> = {}): LectureState => ({
  inviteCode: "123456",
  total: 6,
  played: [],
  current: null,
  finished: false,
  ...overrides,
})

const definition = {
  id: "path-pick",
  question: "Which path fits you?",
  options: ["Full game", "Minigame"],
}

const open = (extra: Partial<PollSnapshot> = {}): PollSnapshot => ({
  pollId: "path-pick",
  question: "Which path fits you?",
  options: ["Full game", "Minigame"],
  anonymous: true,
  phase: "open",
  total: 0,
  ...extra,
})

const fire = (event: string, ...args: unknown[]) => {
  act(() => {
    mocks.handlers.get(event)?.(...(args as never[]))
  })
}

const sendCommand = (
  body: Record<string, unknown>,
  { origin = DECK, source = window as Window | null } = {},
) => {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "cst426-deck", v: 1, ...body },
        origin,
        source,
      }),
    )
  })
}

// This page is the manager of a lecture game showing the lobby.
const attach = (lecture: LectureState | null = lectureState()) => {
  act(() => {
    useManagerStore.setState({
      gameId: "g-1",
      status: {
        name: STATUS.SHOW_ROOM,
        data: { inviteCode: "123456" },
      } as never,
      lecture,
      config,
    })
  })
  fire(EVENTS.MANAGER.SUCCESS_RECONNECT, {})
}

const postMessage = vi.fn<(_message: BridgeMessage, _origin: string) => void>()

const posted = () => postMessage.mock.calls.map(([message]) => message)

const results = () =>
  posted().flatMap((message) => (message.type === "result" ? [message] : []))

const errorCodes = () =>
  posted().flatMap((message) =>
    message.type === "error" ? [message.code] : [],
  )

const lastState = () =>
  posted()
    .flatMap((message) =>
      message.type === "status" || message.type === "ready"
        ? [message.state]
        : [],
    )
    .at(-1)

// The ack of the command just sent, answered the way the server would.
const answer = (outcome: string | null, error: Error | null = null) => {
  const callback = mocks.ackEmit.mock.calls.at(-1)?.[2] as Ack

  act(() => {
    callback(error, outcome ?? undefined)
  })
}

const sentOf = (event: string) =>
  mocks.ackEmit.mock.calls.filter(([sent]) => sent === event)

describe("useDeckBridge and polls", () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.navigate.mockReset()
    mocks.setSuppressed.mockReset()
    mocks.socket.emit.mockReset()
    mocks.ackEmit.mockReset()
    mocks.router.pathname = "/manager"
    useManagerStore.getState().reset()
    usePollStore.getState().reset()
    postMessage.mockReset()
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
    })
    vi.spyOn(window, "postMessage").mockImplementation(
      (message: unknown, origin: unknown) => {
        postMessage(message as BridgeMessage, origin as string)
      },
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // What it tells the deck
  it("lists its features and an empty poll lane at hello, attached or not", () => {
    renderHook(() => {
      useDeckBridge()
    })

    sendCommand({ type: "hello" })

    expect(lastState()).toMatchObject({
      features: ["poll", "pollInline"],
      poll: null,
      pollsDone: [],
    })
  })

  it("reports the poll on the stage, and polls that already ran", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach(
      lectureState({ pollsDone: [{ id: "one", counts: [2, 1], total: 3 }] }),
    )

    act(() => {
      usePollStore.getState().apply(open({ total: 2 }))
    })

    expect(lastState()).toMatchObject({
      poll: {
        id: "path-pick",
        phase: "open",
        live: false,
        anonymous: true,
        voted: 2,
      },
      pollsDone: [{ id: "one", counts: [2, 1], total: 3 }],
    })
    expect(lastState()?.poll).not.toHaveProperty("counts")

    act(() => {
      usePollStore
        .getState()
        .apply(open({ phase: "closed", counts: [1, 1], total: 2 }))
    })

    expect(lastState()?.poll).toMatchObject({
      phase: "closed",
      counts: [1, 1],
    })

    act(() => {
      usePollStore.getState().apply(null)
    })

    expect(lastState()?.poll).toBeNull()
  })

  // The startPoll command
  it("sends the definition to the game it manages and reports the outcome", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach()

    sendCommand({ type: "startPoll", poll: { ...definition, live: true } })

    expect(sentOf(EVENTS.MANAGER.START_POLL)).toEqual([
      [
        EVENTS.MANAGER.START_POLL,
        { gameId: "g-1", poll: { ...definition, live: true } },
        expect.any(Function),
      ],
    ])

    answer("accepted")

    expect(results().at(-1)).toMatchObject({
      command: "startPoll",
      outcome: "accepted",
    })
    expect(results().at(-1)).not.toHaveProperty("reason")
  })

  it.each(["busy", "notLecture", "notManager", "notFound"])(
    "reports %s as ignored, with the reason",
    (outcome) => {
      renderHook(() => {
        useDeckBridge()
      })
      sendCommand({ type: "hello" })
      attach()
      sendCommand({ type: "startPoll", poll: definition })

      answer(outcome)

      expect(results().at(-1)).toMatchObject({
        command: "startPoll",
        outcome: "ignored",
        reason: outcome,
      })
      expect(errorCodes()).toEqual([])
    },
  )

  it("reports an invalid definition as ignored, and as an error the deck can show", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach()
    sendCommand({
      type: "startPoll",
      poll: { ...definition, options: ["a"] },
    })

    answer("invalid")

    expect(results().at(-1)).toMatchObject({
      command: "startPoll",
      outcome: "ignored",
      reason: "invalid",
    })
    expect(errorCodes()).toEqual(["pollInvalid"])
  })

  it("reports a server that never answers as an error, not as a result", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach()
    sendCommand({ type: "startPoll", poll: definition })

    answer(null, new Error("operation has timed out"))

    expect(errorCodes()).toEqual(["noAck"])
    expect(results()).toEqual([])
  })

  it("never queues a start for a page that is not yet the manager", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })

    sendCommand({ type: "startPoll", poll: definition })

    expect(results().at(-1)).toMatchObject({
      command: "startPoll",
      outcome: "ignored",
      reason: "notAttached",
    })
    expect(mocks.ackEmit).not.toHaveBeenCalled()

    // Attaching later must not run it: it would open a vote on whatever
    // slide the deck has reached by then.
    attach()

    expect(mocks.ackEmit).not.toHaveBeenCalled()
  })

  it("does not send a poll to a game that is not a lecture room", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach(null)

    sendCommand({ type: "startPoll", poll: definition })

    expect(results().at(-1)).toMatchObject({
      outcome: "ignored",
      reason: "notLecture",
    })
    expect(mocks.ackEmit).not.toHaveBeenCalled()
  })

  it("answers a start that is not shaped like one with pollInvalid, to the deck, and sends nothing", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach()
    postMessage.mockClear()

    sendCommand({ type: "startPoll", poll: "path-pick" })
    sendCommand({ type: "startPoll" })
    sendCommand({ type: "startPoll", poll: { ...definition, live: "yes" } })

    expect(postMessage.mock.calls).toEqual([
      [
        {
          source: "razzia-bridge",
          v: 1,
          type: "error",
          code: "pollInvalid",
          command: "startPoll",
        },
        DECK,
      ],
      [
        {
          source: "razzia-bridge",
          v: 1,
          type: "error",
          code: "pollInvalid",
          command: "startPoll",
        },
        DECK,
      ],
      [
        {
          source: "razzia-bridge",
          v: 1,
          type: "error",
          code: "pollInvalid",
          command: "startPoll",
        },
        DECK,
      ],
    ])
    expect(mocks.ackEmit).not.toHaveBeenCalled()
  })

  it("still drops other malformed messages without a word", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach()
    postMessage.mockClear()

    sendCommand({ type: "play", question: "x" })
    sendCommand({ type: "startPolls", poll: definition })
    sendCommand({ type: "nonsense" })
    sendCommand({ type: "startPoll", poll: definition }, { source: null })
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "someone-else", v: 1, type: "startPoll" },
        origin: DECK,
        source: window,
      }),
    )
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "cst426-deck", v: 2, type: "startPoll" },
        origin: DECK,
        source: window,
      }),
    )

    expect(postMessage).not.toHaveBeenCalled()
  })

  it("ignores a start from a page that is not its deck", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach()
    postMessage.mockClear()

    sendCommand(
      { type: "startPoll", poll: definition },
      { origin: "https://evil.example" },
    )
    sendCommand({ type: "startPoll", poll: definition }, { source: null })

    expect(postMessage).not.toHaveBeenCalled()
    expect(mocks.ackEmit).not.toHaveBeenCalled()
  })

  // The closePoll and dismissPoll commands
  it("close the poll the game is showing and report the outcome", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach()

    sendCommand({ type: "closePoll" })
    expect(sentOf(EVENTS.MANAGER.CLOSE_POLL)).toEqual([
      [EVENTS.MANAGER.CLOSE_POLL, { gameId: "g-1" }, expect.any(Function)],
    ])
    answer("accepted")

    sendCommand({ type: "dismissPoll" })
    expect(sentOf(EVENTS.MANAGER.DISMISS_POLL)).toEqual([
      [EVENTS.MANAGER.DISMISS_POLL, { gameId: "g-1" }, expect.any(Function)],
    ])
    answer("none")

    expect(results().map(({ command, outcome }) => [command, outcome])).toEqual(
      [
        ["closePoll", "accepted"],
        ["dismissPoll", "ignored"],
      ],
    )
    expect(results().at(-1)).toMatchObject({ reason: "none" })
  })

  it("are not queued either", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })

    sendCommand({ type: "closePoll" })
    sendCommand({ type: "dismissPoll" })

    expect(results().map(({ reason }) => reason)).toEqual([
      "notAttached",
      "notAttached",
    ])
    expect(mocks.ackEmit).not.toHaveBeenCalled()
  })

  // Sound
  it("stays off while a poll shows, even though the deck can see the page", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    sendCommand({ type: "visibility", visible: true })

    expect(mocks.setSuppressed).toHaveBeenLastCalledWith(false)

    act(() => {
      usePollStore.getState().apply(open())
    })

    expect(mocks.setSuppressed).toHaveBeenLastCalledWith(true)

    act(() => {
      usePollStore.getState().apply(null)
    })

    expect(mocks.setSuppressed).toHaveBeenLastCalledWith(false)
  })

  it("does not let a visibility message turn it on under a poll", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    act(() => {
      usePollStore.getState().apply(open())
    })

    sendCommand({ type: "visibility", visible: true })

    expect(mocks.setSuppressed).toHaveBeenLastCalledWith(true)
  })

  it("will not run a quiz step while a poll shows, and says so", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach()
    act(() => {
      usePollStore.getState().apply(open())
    })
    postMessage.mockClear()
    mocks.socket.emit.mockClear()

    sendCommand({ type: "leaderboard" })
    sendCommand({ type: "play", question: 0 })
    sendCommand({ type: "finish" })

    expect(
      results().map(({ command, outcome, reason }) => [
        command,
        outcome,
        reason,
      ]),
    ).toEqual([
      ["leaderboard", "ignored", "busy"],
      ["play", "ignored", "busy"],
      ["finish", "ignored", "busy"],
    ])
    expect(mocks.socket.emit).not.toHaveBeenCalled()
    expect(mocks.ackEmit).not.toHaveBeenCalled()
  })

  it("runs the quiz steps again once the poll is gone", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach()
    act(() => {
      usePollStore.getState().apply(open())
    })
    act(() => {
      usePollStore.getState().apply(null)
    })

    sendCommand({ type: "play", question: 0 })

    expect(sentOf(EVENTS.MANAGER.PLAY_QUESTION)).toHaveLength(1)
  })

  it("carries no student's name in any message, whatever the poll was", () => {
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attach(
      lectureState({ pollsDone: [{ id: "one", counts: [1, 1], total: 2 }] }),
    )
    act(() => {
      usePollStore.getState().apply(
        open({
          anonymous: false,
          phase: "closed",
          counts: [1, 1],
          total: 2,
          voters: [
            { username: "Alice", option: 0 },
            { username: "Bobby", option: 1 },
          ],
        }),
      )
    })
    sendCommand({ type: "dismissPoll" })
    answer("accepted")

    const everything = JSON.stringify(posted())

    expect(everything).toContain("path-pick")
    expect(everything).not.toContain("Alice")
    expect(everything).not.toContain("Bobby")
    expect(everything).not.toContain("voters")
  })

  it("tells a deck that reloaded mid-poll which poll is open and how many voted", () => {
    // The frame came back: the page re-attached and asked the room where the
    // poll stands, so the store holds it when the deck says hello again.
    renderHook(() => {
      useDeckBridge()
    })
    attach()
    act(() => {
      usePollStore.getState().apply(open({ total: 3 }))
    })

    sendCommand({ type: "hello" })

    expect(lastState()?.poll).toEqual({
      id: "path-pick",
      phase: "open",
      anonymous: true,
      live: false,
      voted: 3,
    })
  })
})
