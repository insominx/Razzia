import { Route } from "@razzia/web/pages/__root"
import { cleanup, render } from "@testing-library/react"
import type { ComponentType, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  router: { pathname: "/" },
}))

vi.mock("@tanstack/react-router", () => ({
  createRootRoute: (options: unknown) => ({ options }),
  Outlet: () => null,
  useRouterState: ({
    select,
  }: {
    select: (_state: { location: { pathname: string } }) => string
  }) => select({ location: { pathname: mocks.router.pathname } }),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  SocketProvider: ({ children }: { children: ReactNode }) => children,
  useSocket: () => ({ isConnected: false, connect: mocks.connect }),
}))

vi.mock("@razzia/web/features/deck/DeckBridge", () => ({ default: () => null }))

const Root = (Route as unknown as { options: { component: ComponentType } })
  .options.component

describe("the root route", () => {
  beforeEach(() => {
    mocks.connect.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it.each([
    "/",
    "/manager",
    "/manager/config",
    "/manager/quizz/abc",
    "/party/123",
    "/party/manager/g-1",
    "/rehearsals",
    "/developer",
  ])("connects to the server on %s", (pathname) => {
    mocks.router.pathname = pathname
    render(<Root />)

    expect(mocks.connect).toHaveBeenCalled()
  })

  // They play on a fake socket; a real one would only reach the server.
  it.each([
    "/rehearse",
    "/rehearse/",
    "/rehearse/frame",
    "/dev/gallery",
    "/dev/frame",
  ])("stays off the server on %s", (pathname) => {
    mocks.router.pathname = pathname
    render(<Root />)

    expect(mocks.connect).not.toHaveBeenCalled()
  })

  it("connects on leaving the rehearsal for a page that needs the server", () => {
    mocks.router.pathname = "/rehearse"
    const { rerender } = render(<Root />)

    mocks.router.pathname = "/manager"
    rerender(<Root />)

    expect(mocks.connect).toHaveBeenCalled()
  })
})
