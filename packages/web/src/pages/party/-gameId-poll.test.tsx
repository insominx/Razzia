import { EVENTS } from "@razzia/common/constants"
import type { PollSnapshot } from "@razzia/common/types/poll"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
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
}))

vi.mock("@razzia/web/features/game/components/GameWrapper", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="game">{children}</div>
  ),
}))

vi.mock("@razzia/web/features/game/components/GameScreenBoundary", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@razzia/web/features/game/utils/constants", () => ({
  GAME_STATE_COMPONENTS: { WAIT: () => <p>the quiz screen</p> },
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
  const { Route } = await import("@razzia/web/pages/party/$gameId")

  return (Route as unknown as { options: RouteOptions }).options
}

const mount = async () => {
  const { component: Page } = await loadRoute()

  return render(<Page />)
}

const lunch: PollSnapshot = {
  pollId: "lunch",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous: true,
  phase: "open",
  mine: 1,
}

const reconnectPayload = (extra: object = {}) => ({
  gameId: "g1",
  status: { name: "WAIT", data: { text: "x" } },
  player: { username: "Ann", points: 0 },
  currentQuestion: { current: 1, total: 2 },
  visuals: {},
  ...extra,
})

describe("player game page and polls", () => {
  beforeEach(() => {
    mocks.navigate.mockClear()
    mocks.emit.mockClear()
    mocks.handlers.clear()
    usePollStore.getState().reset()
    usePlayerStore.getState().reset()
    useQuestionStore.setState({ questionStates: null })
    usePlayerStore.setState({
      gameId: "g1",
      status: { name: "WAIT", data: { text: "x" } } as never,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("asks where the poll stands as soon as it has opened on a game", async () => {
    await mount()

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.POLL.SYNC, { gameId: "g1" })
  })

  it("shows the poll above the quiz screen, which stays mounted but inert", async () => {
    const { container } = await mount()

    act(() => {
      mocks.handlers.get(EVENTS.POLL.STATE)?.(lunch)
    })

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Lunch?")
    expect(screen.getByText("the quiz screen")).toBeInTheDocument()
    expect(container.querySelector("[inert]")).toContainElement(
      screen.getByTestId("game"),
    )
  })

  it("takes the poll that comes with a reconnect, and clears it when there is none", async () => {
    await mount()

    act(() => {
      mocks.handlers.get(EVENTS.PLAYER.SUCCESS_RECONNECT)?.(
        reconnectPayload({ poll: lunch }),
      )
    })

    expect(usePollStore.getState().snapshot).toEqual(lunch)

    act(() => {
      mocks.handlers.get(EVENTS.PLAYER.SUCCESS_RECONNECT)?.(reconnectPayload())
    })

    expect(usePollStore.getState().snapshot).toBeNull()
  })

  it("clears the poll when the server resets the game", async () => {
    await mount()
    act(() => {
      usePollStore.getState().apply(lunch)
    })

    act(() => {
      mocks.handlers.get(EVENTS.GAME.RESET)?.("errors:game.notFound")
    })

    expect(usePollStore.getState().snapshot).toBeNull()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("leaves no poll behind when the game is left, so none shows in the next room", async () => {
    const { onLeave } = await loadRoute()
    usePollStore.getState().apply(lunch)

    onLeave({ params: { gameId: "g1" } })

    expect(usePollStore.getState().snapshot).toBeNull()
  })
})
