import { renderHook } from "@testing-library/react"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useFollowCreatedGame } from "@razzia/web/features/manager/hooks/use-follow-created-game"
import { beforeEach, describe, expect, it, vi } from "vitest"

const navigate = vi.fn<(..._args: unknown[]) => void>()
const handlers = new Map<string, (..._args: unknown[]) => void>()

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useEvent: (event: string, callback: (..._args: unknown[]) => void) => {
    handlers.set(event, callback)
  },
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}))

describe("useFollowCreatedGame", () => {
  beforeEach(() => {
    navigate.mockReset()
    handlers.clear()
    useManagerStore.getState().reset()
  })

  it("opens the lobby of whichever game the server created", () => {
    useManagerStore
      .getState()
      .setPlayers([
        { id: "old", connected: true, username: "Stale", points: 0, streak: 0 },
      ])
    renderHook(() => {
      useFollowCreatedGame()
    })

    handlers.get(EVENTS.MANAGER.GAME_CREATED)?.({
      gameId: "game-2",
      inviteCode: "123456",
      visuals: { backgroundUrl: "/bg.webp" },
    })

    const state = useManagerStore.getState()
    expect(state.gameId).toBe("game-2")
    expect(state.visuals).toEqual({ backgroundUrl: "/bg.webp" })
    expect(state.players).toEqual([])
    expect(state.status).toMatchObject({
      name: STATUS.SHOW_ROOM,
      data: { text: "game:waitingForPlayers", inviteCode: "123456" },
    })
    expect(navigate).toHaveBeenCalledWith({
      to: "/party/manager/$gameId",
      params: { gameId: "game-2" },
    })
  })
})
