import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { EVENTS } from "@razzia/common/constants"
import { act, cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isConnected: true,
  handlers: new Map<string, () => void>(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({
    socket: { emit: vi.fn() },
    isConnected: mocks.isConnected,
  }),
  useEvent: (event: string, callback: () => void) => {
    mocks.handlers.set(event, callback)
  },
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: unknown }) => ({
    options,
  }),
  Outlet: () => <p>outlet</p>,
  Navigate: () => null,
  useNavigate: () => vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@razzia/web/components/Background", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@razzia/web/components/LanguageSwitcher", () => ({
  default: () => null,
}))

const layoutOf = (route: unknown) =>
  (route as { options: { component: () => ReactNode } }).options.component

describe("layouts across a reconnect", () => {
  afterEach(() => {
    cleanup()
    mocks.isConnected = true
  })

  it("keeps the join forms mounted when the socket drops", async () => {
    const { Route } = await import("@razzia/web/pages/(auth)/layout")
    const Layout = layoutOf(Route)
    const { rerender } = render(<Layout />)

    expect(screen.getByText("outlet")).toBeInTheDocument()

    mocks.isConnected = false
    rerender(<Layout />)

    expect(screen.getByText("outlet")).toBeInTheDocument()
  })

  it("waits behind the loader until the first connection", async () => {
    mocks.isConnected = false
    const { Route } = await import("@razzia/web/pages/(auth)/layout")
    const Layout = layoutOf(Route)
    render(<Layout />)

    expect(screen.queryByText("outlet")).toBeNull()
  })

  it("keeps the quiz editor mounted when the socket drops", async () => {
    const { Route } = await import("@razzia/web/pages/manager/quizz/layout")
    const Layout = layoutOf(Route)
    useManagerStore.setState({ config: { quizz: [], results: [] } as never })
    const { rerender } = render(<Layout />)

    mocks.isConnected = false
    rerender(<Layout />)

    expect(screen.getByText("outlet")).toBeInTheDocument()
  })

  it("forgets the cached config when the server refuses the login", async () => {
    const { Route } = await import("@razzia/web/pages/manager/quizz/layout")
    const Layout = layoutOf(Route)
    useManagerStore.setState({ config: { quizz: [], results: [] } as never })
    render(<Layout />)

    act(() => {
      mocks.handlers.get(EVENTS.MANAGER.UNAUTHORIZED)?.()
    })

    expect(useManagerStore.getState().config).toBeNull()
  })

  it("forgets the cached config on the config page too", async () => {
    vi.doMock("@razzia/web/features/manager/components/configurations", () => ({
      default: () => null,
    }))
    vi.doMock(
      "@razzia/web/features/manager/hooks/use-follow-created-game",
      () => ({
        useFollowCreatedGame: () => undefined,
      }),
    )
    const { Route } = await import("@razzia/web/pages/manager/config")
    const Page = layoutOf(Route)
    useManagerStore.setState({ config: { quizz: [], results: [] } as never })
    render(<Page />)

    act(() => {
      mocks.handlers.get(EVENTS.MANAGER.UNAUTHORIZED)?.()
    })

    expect(useManagerStore.getState().config).toBeNull()
  })
})
