import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface BlockerOpts {
  shouldBlockFn: () => boolean
  disabled?: boolean
}

const mocks = vi.hoisted(() => ({
  embed: false,
  connected: false,
  navigate: vi.fn(),
  emit: vi.fn(),
  proceed: vi.fn(),
  reset: vi.fn(),
  handlers: new Map<string, (_payload?: unknown) => void>(),
  blockerOpts: null as unknown as {
    shouldBlockFn: () => boolean
    disabled?: boolean
    enableBeforeUnload?: boolean
  },
  resolver: { status: "idle" } as Record<string, unknown>,
}))

vi.mock("@razzia/web/features/deck/embed", () => ({
  get IS_DECK_EMBED() {
    return mocks.embed
  },
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  socketClient: {
    emit: mocks.emit,
    get connected() {
      return mocks.connected
    },
  },
  useEvent: (event: string, handler: (_payload?: unknown) => void) => {
    mocks.handlers.set(event, handler)
  },
  useSocket: () => ({ socket: { emit: mocks.emit } }),
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
  useParams: () => ({ gameId: "g1" }),
  useBlocker: (opts: BlockerOpts) => {
    mocks.blockerOpts = opts

    return mocks.resolver
  },
}))

vi.mock("@razzia/web/features/game/components/GameWrapper", () => ({
  default: ({
    children,
    onBack,
    onNext,
  }: {
    children: ReactNode
    onBack?: () => void
    onNext?: () => void
  }) => (
    <div>
      {onBack && <button onClick={onBack}>exit</button>}
      {onNext && <button onClick={onNext}>next</button>}
      {children}
    </div>
  ),
}))

vi.mock("@razzia/web/features/game/components/GameScreenBoundary", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@razzia/web/features/game/components/states/Responses", () => ({
  default: () => null,
}))

vi.mock("@razzia/web/features/game/utils/constants", () => ({
  GAME_STATE_COMPONENTS_MANAGER: {
    SHOW_ROOM: () => null,
    SELECT_ANSWER: () => null,
    FINISHED: () => null,
  },
  getManagerSkipEvent: () => "manager:skip",
  isKeyOf: (obj: object, key: string) => key in obj,
}))

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

interface RouteOptions {
  component: () => ReactNode
  onLeave: (_match: { params: { gameId: string } }) => void
}

const loadRoute = async () => {
  const { Route } = await import("@razzia/web/pages/party/manager/$gameId")

  return (Route as unknown as { options: RouteOptions }).options
}

const player = { id: "p1", username: "Ann", points: 0 }

const host = (
  name: string,
  extra: Partial<ReturnType<typeof useManagerStore.getState>> = {},
) =>
  useManagerStore.setState({
    gameId: "g1",
    status: { name, data: {} } as never,
    players: [],
    ...extra,
  })

const mount = async () => {
  const { component: Page } = await loadRoute()

  return render(<Page />)
}

describe("manager game route leave guard", () => {
  beforeEach(() => {
    mocks.embed = false
    mocks.connected = false
    mocks.emit.mockReset()
    mocks.resolver = { status: "idle" }
    mocks.navigate.mockClear()
    mocks.emit.mockClear()
    mocks.proceed.mockClear()
    mocks.reset.mockClear()
    mocks.handlers.clear()
    useManagerStore.getState().reset()
    useQuestionStore.setState({ questionStates: { current: 1, total: 2 } })
  })

  afterEach(() => {
    cleanup()
  })

  it("subscribes before requesting the roster even when a created lobby already has status", async () => {
    host(STATUS.SHOW_ROOM)
    mocks.connected = true
    mocks.emit.mockImplementation((event) => {
      if (event === EVENTS.MANAGER.RECONNECT) {
        expect(mocks.handlers.has(EVENTS.MANAGER.PLAYER_PRESENCE)).toBe(true)
        expect(mocks.handlers.has(EVENTS.MANAGER.SUCCESS_RECONNECT)).toBe(true)
      }
    })
    await mount()
    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.MANAGER.RECONNECT, {
      gameId: "g1",
    })
  })

  it("receives presence while a quiz screen replaces the lobby and rejects another room", async () => {
    host(STATUS.SELECT_ANSWER)
    await mount()
    act(() =>
      mocks.handlers.get(EVENTS.MANAGER.PLAYER_PRESENCE)?.({
        gameId: "g1",
        players: [{ ...player, connected: false }],
      }),
    )
    expect(useManagerStore.getState()).toMatchObject({
      presenceKnown: true,
      players: [{ username: "Ann", connected: false }],
    })
    act(() =>
      mocks.handlers.get(EVENTS.MANAGER.PLAYER_PRESENCE)?.({
        gameId: "old",
        players: [],
      }),
    )
    expect(useManagerStore.getState().players).toHaveLength(1)
  })

  it("ignores an old reconnect payload without replacing the current room", async () => {
    host(STATUS.SHOW_ROOM)
    await mount()
    act(() =>
      mocks.handlers.get(EVENTS.MANAGER.SUCCESS_RECONNECT)?.({
        gameId: "old",
        players: [],
      }),
    )
    expect(useManagerStore.getState()).toMatchObject({
      gameId: "g1",
      presenceKnown: false,
    })
  })

  it("does not block leaving an empty lobby", async () => {
    host(STATUS.SHOW_ROOM)
    await mount()

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(false)
  })

  it("blocks leaving a lobby that has a player in it", async () => {
    host(STATUS.SHOW_ROOM, { players: [player] as never })
    await mount()

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(true)
  })

  it("blocks leaving once a question has started, even with no players", async () => {
    host(STATUS.SELECT_ANSWER)
    await mount()

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(true)
  })

  it("does not block leaving a finished game", async () => {
    host(STATUS.FINISHED, { players: [player] as never })
    await mount()

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(false)
  })

  it("does not block leaving a finished lecture", async () => {
    host(STATUS.SELECT_ANSWER, {
      players: [player] as never,
      lecture: { finished: true } as never,
    })
    await mount()

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(false)
  })

  it("does not block when no game is attached", async () => {
    host(STATUS.SELECT_ANSWER, { gameId: null, players: [player] as never })
    await mount()

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(false)
  })

  it("never blocks in a lecture deck embed", async () => {
    mocks.embed = true
    host(STATUS.SELECT_ANSWER, { players: [player] as never })
    await mount()

    expect(mocks.blockerOpts.shouldBlockFn()).toBe(false)
    expect(mocks.blockerOpts.disabled).toBe(true)
  })

  it("leaves closing the tab alone", async () => {
    host(STATUS.SELECT_ANSWER)
    await mount()

    expect(mocks.blockerOpts.enableBeforeUnload).toBe(false)
  })

  it("shows no prompt while nothing is blocked", async () => {
    host(STATUS.SELECT_ANSWER)
    await mount()

    expect(screen.queryByText("game:leave.title")).toBeNull()
  })

  it("asks when a leave is blocked and proceeds on confirm", async () => {
    host(STATUS.SELECT_ANSWER)
    mocks.resolver = {
      status: "blocked",
      proceed: mocks.proceed,
      reset: mocks.reset,
    }
    await mount()

    expect(screen.getByText("game:leave.title")).toBeTruthy()
    expect(screen.getByText("game:leave.description")).toBeTruthy()

    fireEvent.click(screen.getByText("game:leave.confirm"))

    expect(mocks.proceed).toHaveBeenCalledTimes(1)
  })

  it("keeps the room on cancel", async () => {
    host(STATUS.SELECT_ANSWER)
    mocks.resolver = {
      status: "blocked",
      proceed: mocks.proceed,
      reset: mocks.reset,
    }
    await mount()

    fireEvent.click(screen.getByText("common:cancel"))

    expect(mocks.reset).toHaveBeenCalledTimes(1)
    expect(mocks.proceed).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it("lets the lobby Exit leave an empty lobby straight away", async () => {
    host(STATUS.SHOW_ROOM)
    await mount()

    fireEvent.click(screen.getByText("exit"))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      replace: true,
      ignoreBlocker: true,
    })
    expect(useManagerStore.getState().gameId).toBeNull()
    expect(useQuestionStore.getState().questionStates).toBeNull()
  })

  it("asks first when the lobby Exit would close a room with players", async () => {
    host(STATUS.SHOW_ROOM, { players: [player] as never })
    await mount()

    fireEvent.click(screen.getByText("exit"))

    expect(screen.getByText("game:leave.title")).toBeTruthy()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(useManagerStore.getState().gameId).toBe("g1")

    fireEvent.click(screen.getByText("game:leave.confirm"))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      replace: true,
      ignoreBlocker: true,
    })
    expect(useManagerStore.getState().gameId).toBeNull()
  })

  it("stays in the lobby when the Exit prompt is cancelled", async () => {
    host(STATUS.SHOW_ROOM, { players: [player] as never })
    await mount()

    fireEvent.click(screen.getByText("exit"))
    fireEvent.click(screen.getByText("common:cancel"))

    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(screen.queryByText("game:leave.title")).toBeNull()
    expect(useManagerStore.getState().gameId).toBe("g1")
  })

  it("bypasses the blocker when the server resets the game", async () => {
    host(STATUS.SELECT_ANSWER, { players: [player] as never })
    await mount()

    act(() => {
      mocks.handlers.get(EVENTS.GAME.RESET)?.("errors:game.notFound")
    })

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      replace: true,
      ignoreBlocker: true,
    })
  })

  it("bypasses the blocker when a finished game is left with Next", async () => {
    host(STATUS.FINISHED, { players: [player] as never })
    await mount()

    fireEvent.click(screen.getByText("next"))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      replace: true,
      ignoreBlocker: true,
    })
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  it("tells the server when the route is left", async () => {
    const { onLeave } = await loadRoute()
    host(STATUS.SELECT_ANSWER)

    onLeave({ params: { gameId: "g1" } })

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.MANAGER.LEAVE, {
      gameId: "g1",
    })
    expect(useManagerStore.getState().status).toBeNull()
  })
})
