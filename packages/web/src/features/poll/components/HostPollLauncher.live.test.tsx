import { STATUS } from "@razzia/common/types/game/status"
import type { ManagerConfig } from "@razzia/common/types/manager"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import HostPollLauncher from "@razzia/web/features/poll/components/HostPollLauncher"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@razzia/web/features/deck/embed", () => ({ IS_DECK_EMBED: false }))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() } }),
  useEvent: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const config = (polls: ManagerConfig["polls"]): ManagerConfig => ({
  quizz: [],
  polls,
  pollResults: [],
  results: [],
  game: { resolvedVisuals: {} },
})

describe("HostPollLauncher and live results", () => {
  beforeEach(() => {
    usePollStore.getState().reset()
    useManagerStore.getState().reset()
    useManagerStore.setState({
      gameId: "g1",
      lecture: {
        inviteCode: "123456",
        total: 2,
        played: [0],
        current: 0,
        finished: false,
      },
      hostControls: true,
      status: { name: STATUS.SHOW_RESPONSES, data: {} } as never,
      config: config([
        { id: "sealed", question: "Sealed?", optionCount: 2, anonymous: true },
        {
          id: "live",
          question: "Live?",
          optionCount: 2,
          anonymous: true,
          live: true,
        },
      ]),
    })
  })

  afterEach(cleanup)

  it("tags only the poll that shows results while people vote", () => {
    render(<HostPollLauncher />)
    fireEvent.click(
      screen.getByRole("button", { name: "poll:launcher.button" }),
    )

    const rowOf = (question: string) =>
      screen.getByText(question).closest("button")?.textContent ?? ""

    expect(rowOf("Live?")).toContain("poll:launcher.live")
    expect(rowOf("Sealed?")).not.toContain("poll:launcher.live")
  })
})
