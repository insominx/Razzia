import { EVENTS } from "@razzia/common/constants"
import type { PollWithId } from "@razzia/common/types/poll"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { act, cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isConnected: true,
  emit: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  handlers: new Map<string, (_payload?: unknown) => void>(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({
    socket: { emit: mocks.emit },
    isConnected: mocks.isConnected,
  }),
  useEvent: (event: string, handler: (_payload?: unknown) => void) => {
    mocks.handlers.set(event, handler)
  },
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: () => ReactNode }) => ({
    options,
    useParams: () => ({ pollId: "p1" }),
  }),
  Outlet: () => <p>outlet</p>,
  useNavigate: () => mocks.navigate,
}))

vi.mock("@razzia/web/components/Loader", () => ({
  default: () => <p>loading</p>,
}))

vi.mock("@razzia/web/features/poll/components/PollEditor", () => ({
  default: ({ initial }: { initial?: PollWithId }) => (
    <p>{initial ? `editing ${initial.question}` : "new poll"}</p>
  ),
}))

vi.mock("react-hot-toast", () => ({
  default: { error: mocks.toastError },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const componentOf = (route: unknown) =>
  (route as { options: { component: () => ReactNode } }).options.component

const loaded: PollWithId = {
  id: "p1",
  question: "Lunch?",
  options: ["Pizza", "Soup"],
  anonymous: true,
}

beforeEach(() => {
  mocks.isConnected = true
  mocks.emit.mockReset()
  mocks.navigate.mockReset()
  mocks.toastError.mockReset()
  mocks.handlers.clear()
  useManagerStore.getState().reset()
})

afterEach(() => {
  cleanup()
})

describe("the polls route layout", () => {
  const load = async () => {
    const { Route } = await import("@razzia/web/pages/manager/polls/layout")

    return componentOf(Route)
  }

  it("waits behind a loader, and asks for the config, until it has one", async () => {
    const Layout = await load()
    render(<Layout />)

    expect(screen.getByText("loading")).toBeInTheDocument()
    expect(screen.queryByText("outlet")).toBeNull()
    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.MANAGER.GET_CONFIG)
  })

  it("does not ask while the socket is down", async () => {
    mocks.isConnected = false
    const Layout = await load()
    render(<Layout />)

    expect(mocks.emit).not.toHaveBeenCalled()
  })

  it("shows the editor once it has the config, and keeps it through a reconnect", async () => {
    useManagerStore.setState({ config: { quizz: [], polls: [] } as never })
    const Layout = await load()
    const { rerender } = render(<Layout />)

    expect(screen.getByText("outlet")).toBeInTheDocument()

    mocks.isConnected = false
    rerender(<Layout />)

    expect(screen.getByText("outlet")).toBeInTheDocument()
  })

  it("keeps the config the server sends", async () => {
    const Layout = await load()
    render(<Layout />)

    act(() => {
      mocks.handlers.get(EVENTS.MANAGER.CONFIG)?.({ quizz: [], polls: [] })
    })

    expect(screen.getByText("outlet")).toBeInTheDocument()
  })

  it("forgets the config and returns to the login when the server no longer knows the host", async () => {
    useManagerStore.setState({ config: { quizz: [], polls: [] } as never })
    const Layout = await load()
    render(<Layout />)

    act(() => {
      mocks.handlers.get(EVENTS.MANAGER.UNAUTHORIZED)?.()
    })

    expect(useManagerStore.getState().config).toBeNull()
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager",
      ignoreBlocker: true,
    })
  })
})

describe("the new poll route", () => {
  it("opens an empty editor", async () => {
    const { Route } = await import("@razzia/web/pages/manager/polls/index")
    const Page = componentOf(Route)

    render(<Page />)

    expect(screen.getByText("new poll")).toBeInTheDocument()
  })
})

describe("the edit poll route", () => {
  const load = async () => {
    const { Route } = await import("@razzia/web/pages/manager/polls/$pollId")

    return componentOf(Route)
  }

  it("asks for the poll and waits behind a loader", async () => {
    const Page = await load()
    render(<Page />)

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.POLLS.GET, "p1")
    expect(screen.getByText("loading")).toBeInTheDocument()
  })

  it("opens the editor on the poll it asked for", async () => {
    const Page = await load()
    render(<Page />)

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.DATA)?.({ poll: loaded })
    })

    expect(screen.getByText("editing Lunch?")).toBeInTheDocument()
  })

  it("ignores a poll it did not ask for", async () => {
    const Page = await load()
    render(<Page />)

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.DATA)?.({
        poll: { ...loaded, id: "other" },
      })
    })

    expect(screen.getByText("loading")).toBeInTheDocument()
  })

  it("goes back to the manager, saying why, when the poll is not there", async () => {
    const Page = await load()
    render(<Page />)

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.ERROR)?.("errors:poll.notFound")
    })

    expect(mocks.toastError).toHaveBeenCalledWith("errors:poll.notFound")
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/manager/config",
      replace: true,
    })
  })

  it("leaves an error to the editor once the poll is open", async () => {
    const Page = await load()
    render(<Page />)
    act(() => {
      mocks.handlers.get(EVENTS.POLLS.DATA)?.({ poll: loaded })
    })

    act(() => {
      mocks.handlers.get(EVENTS.POLLS.ERROR)?.("errors:poll.failedToSave")
    })

    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
