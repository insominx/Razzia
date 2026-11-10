import { EVENTS } from "@razzia/common/constants"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useHostPresence } from "@razzia/web/features/game/hooks/use-host-presence"
import Room from "@razzia/web/features/game/components/states/Room"
import {
  useEvent,
  SocketContext,
} from "@razzia/web/features/game/contexts/socket-context"
import { act, cleanup, render } from "@testing-library/react"
import { StrictMode, useEffect, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cue: vi.fn(),
}))

vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: { start: mocks.start, cue: mocks.cue, stop: vi.fn() },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count: number }) =>
      opts ? `${key}:${opts.count}` : key,
  }),
}))

// These tests keep the real useEvent, because how it holds its handler is the
// point: a handler lives on from the render that made it until the next effect.
const listeners = new Map<string, Set<(payload: unknown) => void>>()

const fakeSocket = {
  emit: vi.fn(),
  on: (event: string, callback: (payload: unknown) => void) => {
    if (!listeners.has(event)) {
      listeners.set(event, new Set())
    }

    listeners.get(event)?.add(callback)
  },
  off: (event: string, callback: (payload: unknown) => void) => {
    listeners.get(event)?.delete(callback)
  },
}

const subscribed = (event: string) => [...(listeners.get(event) ?? [])]

const fire = (event: string, payload: unknown) => {
  for (const callback of subscribed(event)) {
    callback(payload)
  }
}

const player = (name: string) => ({
  id: `socket-${name}`,
  connected: true,
  username: name,
  points: 0,
  streak: 0,
})

const arrives = (name: string) =>
  fire(EVENTS.MANAGER.PLAYER_PRESENCE, {
    gameId: "game-1",
    players: [...useManagerStore.getState().players, player(name)],
  })
const gone = (id: string) =>
  fire(EVENTS.MANAGER.PLAYER_PRESENCE, {
    gameId: "game-1",
    players: useManagerStore.getState().players.filter((p) => p.id !== id),
  })

// As in the app: the page puts the reconnect's list in the store, and the
// lobby gets the same event.
const reconnects = (names: string[]) => {
  const players = names.map(player)

  useManagerStore.getState().setPlayers(players)
  fire(EVENTS.MANAGER.SUCCESS_RECONNECT, { gameId: "game-1", players })
}

const lobby = () => (
  <StrictMode>
    <SocketContext.Provider
      value={{
        socket: fakeSocket as never,
        isConnected: true,
        clientId: "host",
        connect: vi.fn(),
        disconnect: vi.fn(),
        reconnect: vi.fn(),
      }}
    >
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "123456" }}
      />
    </SocketContext.Provider>
  </StrictMode>
)

const renderLobby = () => render(lobby())

const chipsIn = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-player-chip]")].map(
    (chip) => chip.textContent,
  )

const joinCues = () =>
  mocks.cue.mock.calls.map(([cue]) => (cue as { index: number }).index)

const OwnedRoom = (props: Parameters<typeof Room>[0]) => {
  const seed = useRef(useManagerStore.getState().players)
  useHostPresence("game-1")
  useEvent(EVENTS.MANAGER.SUCCESS_RECONNECT, ({ gameId, players }) =>
    useManagerStore.getState().applyPresence({ gameId, players }),
  )
  useEffect(() => {
    useManagerStore
      .getState()
      .applyPresence({ gameId: "game-1", players: seed.current })
  }, [])

  return <Room {...props} />
}

describe("Room lobby when many phones join at once", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useManagerStore.getState().reset()
    useManagerStore.getState().setGameId("game-1")
    useManagerStore.getState().applyPresence({ gameId: "game-1", players: [] })
    useManagerStore.getState().setStatus("SHOW_ROOM", {
      text: "game:waitingForPlayers",
      inviteCode: "123456",
    })
    listeners.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it("seats everyone when joins arrive before the next render", () => {
    const { container } = renderLobby()
    const names = Array.from(
      { length: 25 },
      (_, index) => `Teacher ${String(index + 1).padStart(2, "0")}`,
    )

    act(() => {
      names.forEach(arrives)
      fire(EVENTS.GAME.TOTAL_PLAYERS, 25)
    })

    expect(chipsIn(container)).toEqual(names)
    expect(
      container.querySelector("[data-players-joined]")?.textContent,
    ).toContain("25")
    expect(container.querySelectorAll("[data-seat-empty]")).toHaveLength(3)
  })

  it("climbs one note per player through a burst", () => {
    renderLobby()

    act(() => {
      ;["Ada", "Bea", "Cy", "Dee"].forEach(arrives)
    })

    expect(joinCues()).toEqual([0, 1, 2, 3])
  })

  it("starts the climb from the players already seated", () => {
    useManagerStore.getState().setPlayers([player("Early")])
    const { container } = renderLobby()

    act(() => {
      arrives("Ada")
      arrives("Bea")
    })

    expect(chipsIn(container)).toEqual(["Early", "Ada", "Bea"])
    expect(joinCues()).toEqual([1, 2])
  })

  it.each([
    ["leaves", EVENTS.MANAGER.REMOVE_PLAYER],
    ["is kicked", EVENTS.MANAGER.PLAYER_KICKED],
  ])("keeps the others when someone %s mid-burst", (_, event) => {
    const { container } = renderLobby()

    act(() => {
      arrives("Ada")
      arrives("Bea")
      arrives("Cy")
      fire(event, player("Bea").id)
      gone(player("Bea").id)
      arrives("Dee")
      arrives("Eve")
    })

    expect(chipsIn(container)).toEqual(["Ada", "Cy", "Dee", "Eve"])
    // Bea's seat freed up, so the next join takes that step again.
    expect(joinCues()).toEqual([0, 1, 2, 2, 3])
  })

  it.each([
    ["leaves", EVENTS.MANAGER.REMOVE_PLAYER],
    ["is kicked", EVENTS.MANAGER.PLAYER_KICKED],
  ])(
    "does not lose a join that shares a tick with a player who %s",
    (_, event) => {
      useManagerStore.getState().setPlayers([player("Early"), player("Stays")])
      const { container } = renderLobby()

      act(() => {
        arrives("Ada")
        fire(event, player("Early").id)
        gone(player("Early").id)
      })

      expect(chipsIn(container)).toEqual(["Stays", "Ada"])
    },
  )

  it("ignores a leave for someone who was never seated", () => {
    const { container } = renderLobby()

    act(() => {
      arrives("Ada")
      gone("socket-nobody")
      arrives("Bea")
    })

    expect(chipsIn(container)).toEqual(["Ada", "Bea"])
    expect(joinCues()).toEqual([0, 1])
  })
})

describe("Room lobby after the host reconnects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useManagerStore.getState().reset()
    useManagerStore.getState().setGameId("game-1")
    useManagerStore.getState().applyPresence({ gameId: "game-1", players: [] })
    useManagerStore.getState().setStatus("SHOW_ROOM", {
      text: "game:waitingForPlayers",
      inviteCode: "123456",
    })
    listeners.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it("shows the players the server sent with the reconnect", () => {
    const { container } = renderLobby()

    act(() => {
      arrives("Ann")
      arrives("Bo")
    })
    expect(chipsIn(container)).toEqual(["Ann", "Bo"])

    // The host dropped, two phones joined in the gap, and the server's whole list
    // came back with the reconnect.
    act(() => reconnects(["Ann", "Bo", "Cy", "Di"]))

    expect(chipsIn(container)).toEqual(["Ann", "Bo", "Cy", "Di"])
  })

  it("keeps adding joins to the list it caught up to", () => {
    const { container } = renderLobby()

    act(() => reconnects(["Ann", "Bo", "Cy"]))
    act(() => arrives("Di"))

    expect(chipsIn(container)).toEqual(["Ann", "Bo", "Cy", "Di"])
    // The note a join plays climbs from the seats there already were.
    expect(joinCues()).toEqual([3])
  })

  it("keeps a join that lands right after the reconnect, before any render", () => {
    const { container, rerender } = renderLobby()

    // In the app the reconnect also puts its list in the store, and the join
    // after it is not in that list. Taking the store's list after the render
    // would drop the join.
    act(() => {
      reconnects(["Ann", "Bo"])
      arrives("Late")
    })
    rerender(lobby())

    expect(chipsIn(container)).toEqual(["Ann", "Bo", "Late"])
  })

  it("renders the current store roster without a competing local list", () => {
    const { container, rerender } = renderLobby()

    act(() => {
      arrives("Ann")
      arrives("Bo")
    })
    act(() => useManagerStore.getState().setPlayers([player("Someone else")]))
    rerender(lobby())

    expect(chipsIn(container)).toEqual(["Someone else"])
  })
})
