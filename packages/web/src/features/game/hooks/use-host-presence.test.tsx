import { EVENTS } from "@razzia/common/constants"
import { useHostPresence } from "@razzia/web/features/game/hooks/use-host-presence"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (data?: unknown) => void>(),
  cue: vi.fn(),
}))
vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useEvent: (event: string, callback: (data?: unknown) => void) =>
    mocks.handlers.set(event, callback),
}))
vi.mock("@razzia/web/features/game/audio", () => ({
  score: { cue: mocks.cue },
}))

const player = (username: string, connected = true) => ({
  id: username,
  username,
  connected,
  points: 0,
  streak: 0,
})
const presence = (players = [player("Alice")], gameId = "g1") => {
  act(() =>
    mocks.handlers.get(EVENTS.MANAGER.PLAYER_PRESENCE)?.({ gameId, players }),
  )
}

beforeEach(() => {
  mocks.handlers.clear()
  mocks.cue.mockClear()
  useManagerStore.getState().reset()
  useManagerStore.getState().setGameId("g1")
})

it("updates the roster with no lobby mounted, including burst joins and disconnects", () => {
  renderHook(() => useHostPresence("g1"))
  presence()
  presence([player("Alice"), player("Bobby")])
  presence([player("Alice", false), player("Bobby")])
  expect(useManagerStore.getState()).toMatchObject({
    presenceKnown: true,
    players: [{ connected: false }, { connected: true }],
  })
  // A quiz screen receives presence without playing lobby arrival audio.
  expect(mocks.cue).not.toHaveBeenCalled()
})

it("rejects old-room snapshots after restart and clears on teardown", () => {
  const { unmount, rerender } = renderHook(
    ({ gameId }) => useHostPresence(gameId),
    { initialProps: { gameId: "g1" } },
  )
  presence()
  act(() => useManagerStore.getState().setGameId("g2"))
  rerender({ gameId: "g2" })
  presence()
  expect(useManagerStore.getState()).toMatchObject({
    players: [],
    presenceKnown: false,
  })
  presence([player("New")], "g2")
  expect(useManagerStore.getState().players[0].username).toBe("New")
  unmount()
  expect(useManagerStore.getState()).toMatchObject({
    players: [],
    presenceKnown: false,
  })
})

it("marks cached presence unknown when the host drops and waits for a fresh roster", () => {
  renderHook(() => useHostPresence("g1"))
  presence()
  act(() => mocks.handlers.get("disconnect")?.())
  expect(useManagerStore.getState()).toMatchObject({
    presenceKnown: false,
    players: [{ username: "Alice" }],
  })
  presence([player("Alice", false)])
  expect(useManagerStore.getState().presenceKnown).toBe(true)
  expect(mocks.cue).not.toHaveBeenCalled()
})

it("replaces a returning seat without arrival audio or legacy event writers", () => {
  useManagerStore.getState().setStatus("SHOW_ROOM", {
    text: "game:waitingForPlayers",
    inviteCode: "123456",
  })
  renderHook(() => useHostPresence("g1"))
  presence()
  presence([{ ...player("Alice"), id: "new-socket" }])
  expect(useManagerStore.getState().players).toHaveLength(1)
  expect(useManagerStore.getState().players[0].id).toBe("new-socket")
  expect(mocks.cue).not.toHaveBeenCalled()
  expect(mocks.handlers.has(EVENTS.MANAGER.NEW_PLAYER)).toBe(false)
  expect(mocks.handlers.has(EVENTS.MANAGER.REMOVE_PLAYER)).toBe(false)
  expect(mocks.handlers.has(EVENTS.MANAGER.PLAYER_KICKED)).toBe(false)
})
