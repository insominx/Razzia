import { EVENTS } from "@razzia/common/constants"
import type { ManagerConfig } from "@razzia/common/types/manager"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { REHEARSAL_KEY, saveDraft } from "@razzia/web/features/rehearse/draft"
import { Route } from "@razzia/web/pages/manager/config"
import { memoryStorage } from "@razzia/web/test/memory-storage"
import { act, cleanup, render } from "@testing-library/react"
import type { ComponentType } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn<(..._args: unknown[]) => void>(),
  navigate: vi.fn<(..._args: unknown[]) => void>(),
  handlers: new Map<string, (..._args: unknown[]) => void>(),
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Navigate: () => null,
  useNavigate: () => mocks.navigate,
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit }, isConnected: true }),
  useEvent: (event: string, callback: (..._args: unknown[]) => void) => {
    mocks.handlers.set(event, callback)
  },
}))

vi.mock("@razzia/web/features/manager/components/configurations", () => ({
  default: () => null,
}))

vi.mock("@razzia/web/features/manager/hooks/use-follow-created-game", () => ({
  useFollowCreatedGame: vi.fn(),
}))

const config = {
  quizz: [],
  results: [],
  game: { visuals: {}, resolvedVisuals: {} },
} as unknown as ManagerConfig

const ConfigPage = (
  Route as unknown as { options: { component: ComponentType } }
).options.component

describe("the manager's config page", () => {
  beforeEach(() => {
    mocks.emit.mockReset()
    mocks.navigate.mockReset()
    mocks.handlers.clear()
    vi.stubGlobal("localStorage", memoryStorage())
    useManagerStore.getState().reset()
    saveDraft({
      subject: "Quiz",
      at: 0,
      questions: [
        {
          question: "Which one?",
          answers: ["A", "B"],
          solutions: [1],
          cooldown: 5,
          time: 20,
        },
      ],
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  // Logging out empties the manager's store under this page.
  it("takes the rehearsed draft, answers and all, away on logout", () => {
    act(() => {
      useManagerStore.getState().setConfig(config)
    })
    render(<ConfigPage />)

    act(() => {
      useManagerStore.getState().reset()
    })

    expect(localStorage.getItem(REHEARSAL_KEY)).toBeNull()
  })

  it("keeps the draft while the page waits for its config", () => {
    render(<ConfigPage />)

    expect(localStorage.getItem(REHEARSAL_KEY)).not.toBeNull()
  })

  // A restarted server has forgotten the login and a dropped connection may
  // have missed changes: the page asks again instead of waiting for an action
  // to fail.
  it("asks for the config again when the socket reconnects", () => {
    act(() => {
      useManagerStore.getState().setConfig(config)
    })
    render(<ConfigPage />)
    expect(mocks.emit).not.toHaveBeenCalled()

    act(() => {
      mocks.handlers.get("connect")?.()
    })

    expect(mocks.emit).toHaveBeenCalledTimes(1)
    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.MANAGER.GET_CONFIG)
  })

  it("never sends a password on reconnect", () => {
    act(() => {
      useManagerStore.getState().setConfig(config)
    })
    render(<ConfigPage />)

    act(() => {
      mocks.handlers.get("connect")?.()
    })

    expect(mocks.emit).not.toHaveBeenCalledWith(
      EVENTS.MANAGER.AUTH,
      expect.anything(),
    )
  })

  it("refreshes the lists from the answer", () => {
    act(() => {
      useManagerStore.getState().setConfig(config)
    })
    render(<ConfigPage />)
    const fresh = { ...config, quizz: [{ id: "new", subject: "New" }] }

    act(() => {
      mocks.handlers.get(EVENTS.MANAGER.CONFIG)?.(fresh)
    })

    expect(useManagerStore.getState().config).toEqual(fresh)
  })

  it("goes back to the login quietly when the restarted server does not know the login", () => {
    act(() => {
      useManagerStore.getState().setConfig(config)
    })
    render(<ConfigPage />)

    act(() => {
      mocks.handlers.get("connect")?.()
      mocks.handlers.get(EVENTS.MANAGER.UNAUTHORIZED)?.()
    })

    expect(useManagerStore.getState().config).toBeNull()
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/manager" })
  })
})
