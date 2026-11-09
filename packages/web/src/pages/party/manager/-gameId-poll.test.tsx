import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import type { PollSnapshot } from "@razzia/common/types/poll"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { act, cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  emit: vi.fn(),
  handlers: new Map<string, (_payload?: unknown) => void>(),
}))

vi.mock("@razzia/web/features/deck/embed", () => ({ IS_DECK_EMBED: false }))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  socketClient: { emit: mocks.emit, connected: false },
  useEvent: (event: string, handler: (_payload?: unknown) => void) => {
    mocks.handlers.set(event, handler)
  },
  useSocket: () => ({ socket: { emit: mocks.emit }, isConnected: true }),
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
  useParams: () => ({ gameId: "g1" }),
  useBlocker: () => ({ status: "idle" }),
}))

vi.mock("@razzia/web/features/game/components/GameWrapper", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="game">{children}</div>
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
    SHOW_RESPONSES: () => <p>the results screen</p>,
  },
  getManagerSkipEvent: () => "manager:skip",
  isKeyOf: (obj: object, key: string) => key in obj,
}))

vi.mock("@razzia/web/components/Atmosphere", () => ({ default: () => null }))

vi.mock("@razzia/web/features/game/hooks/use-show-intensity", () => ({
  useCalmVisuals: () => false,
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

const mount = async () => {
  const { component: Page } = await loadRoute()

  return render(<Page />)
}

const lecture = {
  inviteCode: "123456",
  total: 2,
  played: [0],
  current: 0,
  finished: false,
}

const lunch: PollSnapshot = {
  pollId: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous: true,
  phase: "open",
  counts: [1, 0],
  total: 1,
}

const hostRoom = (extra: object = {}) =>
  useManagerStore.setState({
    gameId: "g1",
    status: { name: STATUS.SHOW_RESPONSES, data: {} } as never,
    hostControls: true,
    players: [],
    ...extra,
  })

describe("manager game page and polls", () => {
  beforeEach(() => {
    mocks.navigate.mockClear()
    mocks.emit.mockClear()
    mocks.handlers.clear()
    usePollStore.getState().reset()
    useManagerStore.getState().reset()
    useQuestionStore.setState({ questionStates: null })
  })

  afterEach(() => {
    cleanup()
  })

  it("asks where the poll stands when it opens on a lecture room", async () => {
    hostRoom({ lecture })
    await mount()

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.POLL.SYNC, { gameId: "g1" })
  })

  it("does not ask in a normal game", async () => {
    hostRoom({ lecture: null })
    await mount()

    expect(mocks.emit).not.toHaveBeenCalledWith(
      EVENTS.POLL.SYNC,
      expect.anything(),
    )
  })

  it("offers the poll launcher in a lecture room at rest, and not in a normal game", async () => {
    hostRoom({ lecture })
    const { unmount } = await mount()

    expect(
      screen.getByRole("button", { name: "poll:launcher.button" }),
    ).toBeInTheDocument()
    unmount()

    hostRoom({ lecture: null })
    await mount()

    expect(
      screen.queryByRole("button", { name: "poll:launcher.button" }),
    ).toBeNull()
  })

  it("shows the poll above the results screen, which stays mounted but inert", async () => {
    hostRoom({ lecture })
    const { container } = await mount()

    act(() => {
      mocks.handlers.get(EVENTS.POLL.STATE)?.(lunch)
    })

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Lunch?")
    expect(screen.getByText("the results screen")).toBeInTheDocument()
    expect(container.querySelector("[inert]")).toContainElement(
      screen.getByTestId("game"),
    )
    // Nothing is offered to launch while a poll is showing.
    expect(
      screen.queryByRole("button", { name: "poll:launcher.button" }),
    ).toBeNull()
  })

  it("takes the poll that comes with a reconnect, and clears it when there is none", async () => {
    hostRoom({ lecture })
    await mount()
    const payload = {
      gameId: "g1",
      status: { name: STATUS.SHOW_RESPONSES, data: {} },
      players: [],
      currentQuestion: { current: 1, total: 2 },
      visuals: {},
      lecture,
    }

    act(() => {
      mocks.handlers.get(EVENTS.MANAGER.SUCCESS_RECONNECT)?.({
        ...payload,
        poll: lunch,
      })
    })

    expect(usePollStore.getState().snapshot).toEqual(lunch)

    act(() => {
      mocks.handlers.get(EVENTS.MANAGER.SUCCESS_RECONNECT)?.(payload)
    })

    expect(usePollStore.getState().snapshot).toBeNull()
  })

  it("clears the poll when the server resets the game", async () => {
    hostRoom({ lecture })
    await mount()
    act(() => {
      usePollStore.getState().apply(lunch)
    })

    act(() => {
      mocks.handlers.get(EVENTS.GAME.RESET)?.("errors:game.notFound")
    })

    expect(usePollStore.getState().snapshot).toBeNull()
  })

  it("leaves no poll behind when the route is left", async () => {
    const { onLeave } = await loadRoute()
    usePollStore.getState().apply(lunch)

    onLeave({ params: { gameId: "g1" } })

    expect(usePollStore.getState().snapshot).toBeNull()
  })
})
