import type { ManagerConfig } from "@razzia/common/types/manager"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { REHEARSAL_KEY, saveDraft } from "@razzia/web/features/rehearse/draft"
import { Route } from "@razzia/web/pages/manager/config"
import { memoryStorage } from "@razzia/web/test/memory-storage"
import { act, cleanup, render } from "@testing-library/react"
import type { ComponentType } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Navigate: () => null,
  useNavigate: () => vi.fn(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ isConnected: true }),
  useEvent: vi.fn(),
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
})
