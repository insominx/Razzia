import { act, cleanup, render } from "@testing-library/react"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import Room from "@razzia/web/features/game/components/join/Room"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const navigate = vi.fn<(..._args: unknown[]) => void>()
const handlers = new Map<string, (..._args: unknown[]) => void>()

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() }, isConnected: true }),
  useEvent: (event: string, callback: (..._args: unknown[]) => void) => {
    handlers.set(event, callback)
  },
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => ({}),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("Room rejoin", () => {
  beforeEach(() => {
    navigate.mockReset()
    handlers.clear()
    usePlayerStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
  })

  it("takes a returning player straight back into their game", () => {
    usePlayerStore.getState().setStatus(STATUS.WAIT, { text: "stale" })
    render(<Room />)

    act(() => {
      handlers.get(EVENTS.GAME.SUCCESS_REJOIN)?.("game-7")
    })

    expect(usePlayerStore.getState().status).toBeNull()
    expect(navigate).toHaveBeenCalledWith({
      to: "/party/$gameId",
      params: { gameId: "game-7" },
    })
  })
})
