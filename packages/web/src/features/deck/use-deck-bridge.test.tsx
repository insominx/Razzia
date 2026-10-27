import { EVENTS } from "@razzia/common/constants"
import type { LectureState } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import type { ManagerConfig } from "@razzia/common/types/manager"
import type { BridgeMessage } from "@razzia/web/features/deck/protocol"
import { useDeckBridge } from "@razzia/web/features/deck/use-deck-bridge"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const DECK = "http://localhost:8776"
const QUIZ = "vehicle-physics"

type Handler = (..._args: never[]) => void

const mocks = vi.hoisted(() => {
  const ackEmit = vi.fn()

  return {
    handlers: new Map<string, Handler>(),
    navigate: vi.fn(),
    setSuppressed: vi.fn(),
    router: { pathname: "/manager" },
    connection: { isConnected: true },
    ackEmit,
    socket: { emit: vi.fn(), timeout: vi.fn(() => ({ emit: ackEmit })) },
  }
})

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({
    socket: mocks.socket,
    isConnected: mocks.connection.isConnected,
  }),
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

const stubStorage = () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  }

  vi.stubGlobal("localStorage", storage)

  return storage
}

const rememberInStorage = (
  storage: ReturnType<typeof stubStorage>,
  gameId: string,
) => {
  storage.setItem(
    "razzia_deck_games",
    JSON.stringify({ [QUIZ]: { gameId, at: Date.now() } }),
  )
}

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

// This page is the manager of a lecture game showing that screen.
const attachTo = (
  status: { name: string; data: Record<string, unknown> },
  lecture: LectureState | null = lectureState(),
) => {
  act(() => {
    useManagerStore.setState({
      gameId: "g-1",
      status: status as never,
      lecture,
      config,
    })
  })
  fire(EVENTS.MANAGER.SUCCESS_RECONNECT, {})
}

// In jsdom the page is its own parent, so the bridge's posts land here.
const postMessage = vi.fn<(_message: BridgeMessage, _origin: string) => void>()

const posted = () => postMessage.mock.calls.map(([message]) => message)

const postedOf = (type: BridgeMessage["type"]) =>
  posted().filter((message) => message.type === type)

const lastState = () =>
  posted()
    .flatMap((message) =>
      message.type === "status" || message.type === "ready"
        ? [message.state]
        : [],
    )
    .at(-1)

const errorCodes = () =>
  posted().flatMap((message) =>
    message.type === "error" ? [message.code] : [],
  )

describe("useDeckBridge", () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.navigate.mockReset()
    mocks.setSuppressed.mockReset()
    mocks.socket.emit.mockReset()
    mocks.ackEmit.mockReset()
    mocks.router.pathname = "/manager"
    mocks.connection.isConnected = true
    useManagerStore.getState().reset()
    postMessage.mockReset()
    vi.spyOn(window, "postMessage").mockImplementation(
      (message: unknown, origin: unknown) => {
        postMessage(message as BridgeMessage, origin as string)
      },
    )
  })

  afterEach(() => {
    // Unmounts each test's bridge, so its window listeners go with it.
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("ignores messages from anywhere but its own deck", () => {
    stubStorage()
    renderHook(() => {
      useDeckBridge()
    })

    sendCommand({ type: "hello" }, { origin: "https://evil.example" })
    sendCommand({ type: "hello" }, { source: null })

    expect(postMessage).not.toHaveBeenCalled()
  })

  it("answers hello with its state, to the deck's origin only", () => {
    stubStorage()
    renderHook(() => {
      useDeckBridge()
    })

    sendCommand({ type: "hello" })

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "razzia-bridge",
        v: 1,
        type: "ready",
        state: expect.objectContaining({ connected: true }) as unknown,
      }),
      DECK,
    )
  })

  it("starts quiet and goes quiet again when the deck hides the page", () => {
    stubStorage()
    const { unmount } = renderHook(() => {
      useDeckBridge()
    })

    expect(mocks.setSuppressed).toHaveBeenLastCalledWith(true)

    sendCommand({ type: "visibility", visible: true })
    expect(mocks.setSuppressed).toHaveBeenLastCalledWith(false)

    sendCommand({ type: "visibility", visible: false })
    expect(mocks.setSuppressed).toHaveBeenLastCalledWith(true)

    unmount()
    expect(mocks.setSuppressed).toHaveBeenLastCalledWith(false)
  })

  it("resumes the game this frame remembers", () => {
    const storage = stubStorage()
    rememberInStorage(storage, "g-1")
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    fire(EVENTS.MANAGER.CONFIG, config)

    sendCommand({ type: "ensureGame", quiz: QUIZ })

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/party/manager/$gameId",
      params: { gameId: "g-1" },
      replace: true,
    })
    expect(mocks.socket.emit).not.toHaveBeenCalledWith(
      EVENTS.GAME.CREATE_LECTURE,
      expect.anything(),
    )

    attachTo({ name: STATUS.SHOW_ROOM, data: { inviteCode: "123456" } })

    expect(postedOf("result")).toContainEqual(
      expect.objectContaining({ command: "ensureGame", outcome: "accepted" }),
    )
  })

  it("creates one lecture game when it remembers none, and remembers it", () => {
    const storage = stubStorage()
    mocks.router.pathname = "/manager/config"
    const { rerender } = renderHook(() => {
      useDeckBridge()
    })
    fire(EVENTS.MANAGER.CONFIG, config)

    sendCommand({ type: "ensureGame", quiz: QUIZ })
    rerender()
    sendCommand({ type: "ensureGame", quiz: QUIZ })

    const creates = mocks.socket.emit.mock.calls.filter(
      ([event]) => event === EVENTS.GAME.CREATE_LECTURE,
    )

    expect(creates).toEqual([[EVENTS.GAME.CREATE_LECTURE, QUIZ]])

    fire(EVENTS.MANAGER.GAME_CREATED, {
      gameId: "g-new",
      inviteCode: "654321",
      visuals: {},
    })

    expect(storage.getItem("razzia_deck_games")).toContain("g-new")
  })

  it("opens the config page before creating", () => {
    stubStorage()
    mocks.router.pathname = "/party/manager/old"
    renderHook(() => {
      useDeckBridge()
    })
    fire(EVENTS.MANAGER.CONFIG, config)

    sendCommand({ type: "ensureGame", quiz: QUIZ })

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      replace: true,
    })
    expect(mocks.socket.emit).not.toHaveBeenCalledWith(
      EVENTS.GAME.CREATE_LECTURE,
      expect.anything(),
    )
  })

  it("sends a logged-out host to the password page", () => {
    stubStorage()
    mocks.router.pathname = "/manager/config"
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    fire(EVENTS.MANAGER.UNAUTHORIZED)

    sendCommand({ type: "ensureGame", quiz: QUIZ })

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager",
      replace: true,
    })
    expect(lastState()).toMatchObject({
      loggedIn: false,
      pending: "login",
    })
  })

  it("keeps asking to get back in while the server holds the old connection", () => {
    vi.useFakeTimers()
    stubStorage()
    mocks.router.pathname = "/party/manager/g-1"
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })

    fire(EVENTS.GAME.RESET, "errors:game.managerAlreadyConnected")
    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(mocks.socket.emit).toHaveBeenCalledWith(EVENTS.MANAGER.RECONNECT, {
      gameId: "g-1",
    })

    fire(EVENTS.MANAGER.SUCCESS_RECONNECT, {})
    mocks.socket.emit.mockClear()
    act(() => {
      vi.advanceTimersByTime(20_000)
    })

    expect(mocks.socket.emit).not.toHaveBeenCalledWith(
      EVENTS.MANAGER.RECONNECT,
      expect.anything(),
    )
  })

  it("gives up after a minute and a half", () => {
    vi.useFakeTimers()
    stubStorage()
    mocks.router.pathname = "/party/manager/g-1"
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })

    fire(EVENTS.GAME.RESET, "errors:game.managerAlreadyConnected")
    act(() => {
      vi.advanceTimersByTime(95_000)
    })

    expect(postedOf("error")).toContainEqual(
      expect.objectContaining({ code: "reattachFailed" }),
    )
  })

  it("forgets a game that expired", () => {
    const storage = stubStorage()
    rememberInStorage(storage, "g-1")
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    fire(EVENTS.MANAGER.CONFIG, config)
    sendCommand({ type: "ensureGame", quiz: QUIZ })

    fire(EVENTS.GAME.RESET, "errors:game.expired")

    expect(storage.getItem("razzia_deck_games")).not.toContain("g-1")
    expect(postedOf("error")).toContainEqual(
      expect.objectContaining({ code: "gameExpired" }),
    )
  })

  it("holds a play until the page is the manager, then sends it", () => {
    stubStorage()
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })

    sendCommand({ type: "play", question: 2 })

    expect(postedOf("result")).toContainEqual(
      expect.objectContaining({ command: "play", outcome: "queued" }),
    )
    expect(mocks.ackEmit).not.toHaveBeenCalled()

    attachTo(
      { name: STATUS.SHOW_LEADERBOARD, data: {} },
      lectureState({ played: [0, 1], current: 1 }),
    )

    expect(mocks.ackEmit).toHaveBeenCalledWith(
      EVENTS.MANAGER.PLAY_QUESTION,
      { gameId: "g-1", index: 2 },
      expect.any(Function),
    )

    const [, , ack] = mocks.ackEmit.mock.calls[0] as [
      string,
      unknown,
      (_error: Error | null, _outcome?: string) => void,
    ]

    act(() => {
      ack(null, "accepted")
    })

    expect(postedOf("result").at(-1)).toMatchObject({
      command: "play",
      outcome: "accepted",
    })
  })

  it("reports a refused play and a missing answer", () => {
    stubStorage()
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attachTo({ name: STATUS.SHOW_ROOM, data: {} })

    sendCommand({ type: "play", question: 0 })
    sendCommand({ type: "play", question: 1 })

    const [first, second] = mocks.ackEmit.mock.calls.map(
      ([, , ack]) => ack as (_error: Error | null, _outcome?: string) => void,
    )

    act(() => {
      first(null, "noPlayers")
      second(new Error("timeout"))
    })

    expect(errorCodes()).toEqual(expect.arrayContaining(["noPlayers", "noAck"]))
  })

  it("never replays a question the game has played", () => {
    stubStorage()
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attachTo(
      { name: STATUS.SHOW_LEADERBOARD, data: {} },
      lectureState({ played: [0], current: 0 }),
    )

    sendCommand({ type: "play", question: 0 })

    expect(mocks.ackEmit).not.toHaveBeenCalled()
    expect(postedOf("result").at(-1)).toMatchObject({
      outcome: "ignored",
      reason: "alreadyPlayed",
    })
  })

  it("shows the leaderboard from a question's results", () => {
    stubStorage()
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attachTo(
      { name: STATUS.SHOW_RESPONSES, data: {} },
      lectureState({ played: [0], current: 0 }),
    )

    sendCommand({ type: "leaderboard" })

    expect(mocks.socket.emit).toHaveBeenCalledWith(
      EVENTS.MANAGER.SHOW_LEADERBOARD,
      { gameId: "g-1" },
    )
  })

  it("will not drive a game the deck did not start", () => {
    stubStorage()
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    attachTo({ name: STATUS.SHOW_ROOM, data: {} }, null)

    sendCommand({ type: "play", question: 0 })

    expect(mocks.ackEmit).not.toHaveBeenCalled()
    expect(postedOf("error")).toContainEqual(
      expect.objectContaining({ code: "notLectureGame" }),
    )
  })

  it("hands the deck's navigation keys back to it", () => {
    stubStorage()
    renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })

    const pageDown = new KeyboardEvent("keydown", {
      key: "PageDown",
      code: "PageDown",
      bubbles: true,
      cancelable: true,
    })
    const letter = new KeyboardEvent("keydown", { key: "a", bubbles: true })
    const input = document.createElement("input")
    document.body.append(input)

    act(() => {
      document.body.dispatchEvent(pageDown)
      document.body.dispatchEvent(letter)
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }),
      )
    })
    input.remove()

    expect(postedOf("key")).toEqual([
      expect.objectContaining({ key: "PageDown", code: "PageDown" }),
    ])
    expect(pageDown.defaultPrevented).toBe(true)
  })

  it("posts its state once per change, not on every render", () => {
    stubStorage()
    const { rerender } = renderHook(() => {
      useDeckBridge()
    })
    sendCommand({ type: "hello" })
    const before = postedOf("status").length

    rerender()
    rerender()

    expect(postedOf("status")).toHaveLength(before)

    attachTo({ name: STATUS.SHOW_ROOM, data: { inviteCode: "123456" } })

    expect(lastState()).toMatchObject({
      gameId: "g-1",
      screen: STATUS.SHOW_ROOM,
      inviteCode: "123456",
      lecture: true,
    })
  })
})
