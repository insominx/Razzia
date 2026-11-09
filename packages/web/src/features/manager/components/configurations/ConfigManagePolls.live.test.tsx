import type { PollMeta } from "@razzia/common/types/poll"
import ConfigManagePolls from "@razzia/web/features/manager/components/configurations/ConfigManagePolls"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const list = vi.hoisted(() => ({ polls: [] as PollMeta[] }))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn(), timeout: vi.fn() } }),
  useEvent: vi.fn(),
}))

vi.mock("@razzia/web/features/manager/contexts/config-context", () => ({
  useConfig: () => ({ polls: list.polls, pollResults: [] }),
}))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

afterEach(cleanup)

describe("ConfigManagePolls and live results", () => {
  it("tags only the poll that shows results while people vote", () => {
    list.polls = [
      { id: "sealed", question: "Sealed?", optionCount: 2, anonymous: true },
      {
        id: "live",
        question: "Live?",
        optionCount: 2,
        anonymous: false,
        live: true,
      },
    ]
    render(<ConfigManagePolls />)

    const rowText = (id: string) =>
      document.querySelector(`[data-poll-row="${id}"]`)?.textContent ?? ""

    expect(rowText("live")).toContain("poll:launcher.live")
    expect(rowText("sealed")).not.toContain("poll:launcher.live")
  })
})
