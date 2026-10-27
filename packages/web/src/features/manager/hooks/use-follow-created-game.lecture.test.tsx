import { EVENTS } from "@razzia/common/constants"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useFollowCreatedGame } from "@razzia/web/features/manager/hooks/use-follow-created-game"
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

const lecture = {
  inviteCode: "123456",
  total: 6,
  played: [],
  current: null,
  finished: false,
}

describe("useFollowCreatedGame for a lecture game", () => {
  beforeEach(() => {
    navigate.mockReset()
    handlers.clear()
    useManagerStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
  })

  it("keeps the lecture state the server sent", () => {
    renderHook(() => {
      useFollowCreatedGame()
    })

    handlers.get(EVENTS.MANAGER.GAME_CREATED)?.({
      gameId: "g-1",
      inviteCode: "123456",
      visuals: {},
      lecture,
    })

    expect(useManagerStore.getState().lecture).toEqual(lecture)
  })

  it("clears it for a normal game", () => {
    useManagerStore.getState().setLecture(lecture)
    renderHook(() => {
      useFollowCreatedGame()
    })

    handlers.get(EVENTS.MANAGER.GAME_CREATED)?.({
      gameId: "g-2",
      inviteCode: "654321",
      visuals: {},
    })

    expect(useManagerStore.getState().lecture).toBeNull()
  })
})
