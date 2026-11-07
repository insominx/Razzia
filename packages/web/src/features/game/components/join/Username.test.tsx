import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import Username from "@razzia/web/features/game/components/join/Username"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { handlers, navigate } = vi.hoisted(() => ({
  handlers: new Map<string, (..._args: unknown[]) => void>(),
  navigate: vi.fn(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() } }),
  useEvent: (event: string, callback: (..._args: unknown[]) => void) => {
    handlers.set(event, callback)
  },
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const joined = (payload: Record<string, unknown>) => {
  act(() => {
    handlers.get(EVENTS.GAME.SUCCESS_JOIN)?.({
      gameId: "g-1",
      visuals: {},
      ...payload,
    })
  })
}

describe("Username", () => {
  beforeEach(() => {
    handlers.clear()
    navigate.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("shows a lecture's latecomer the text the server chose", () => {
    render(<Username />)

    joined({ waitText: "game:lectureNextQuestion" })

    expect(usePlayerStore.getState().status).toMatchObject({
      name: STATUS.WAIT,
      data: { text: "game:lectureNextQuestion" },
    })
  })

  it("waits for players in a normal lobby", () => {
    render(<Username />)

    joined({})

    expect(usePlayerStore.getState().status).toMatchObject({
      name: STATUS.WAIT,
      data: { text: "game:waitingForPlayers" },
    })
  })

  it("puts the cursor in the name field on arrival", () => {
    const { container } = render(<Username />)

    expect(document.activeElement).toBe(container.querySelector("input"))
  })

  it("shakes the field when the name is refused", () => {
    const { container } = render(<Username />)

    expect(container.querySelector("[data-shake]")).not.toHaveClass("rz-shake")

    act(() => {
      handlers.get(EVENTS.GAME.ERROR_MESSAGE)?.("errors:game.usernameTaken")
    })

    expect(container.querySelector("[data-shake]")).toHaveClass("rz-shake")
  })
})
