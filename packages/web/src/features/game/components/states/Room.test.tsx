import { EVENTS } from "@razzia/common/constants"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useHostPresence } from "@razzia/web/features/game/hooks/use-host-presence"
import Room from "@razzia/web/features/game/components/states/Room"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  start: vi.fn(),
  cue: vi.fn(),
  handlers: new Map<string, (payload: unknown) => void>(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit }, isConnected: true }),
  useEvent: (event: string, callback: (payload: unknown) => void) => {
    mocks.handlers.set(event, callback)
  },
}))

// The score has its own tests; here a screen is judged by what it asks of it.
vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: { start: mocks.start, cue: mocks.cue, stop: vi.fn() },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const join = (id: string, username: string) => {
  act(() => {
    const player = { id, connected: true, username, points: 0, streak: 0 }
    const previous = useManagerStore.getState().players
    const players = previous.some((p) => p.username === username)
      ? previous.map((p) => (p.username === username ? player : p))
      : [...previous, player]
    mocks.handlers.get(EVENTS.MANAGER.PLAYER_PRESENCE)?.({
      gameId: "game-1",
      players,
    })
  })
}

const OwnedRoom = (props: Parameters<typeof Room>[0]) => {
  useHostPresence("game-1")

  return <Room {...props} />
}

describe("Room lobby", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useManagerStore.getState().reset()
    useManagerStore.getState().setGameId("game-1")
    useManagerStore.getState().applyPresence({ gameId: "game-1", players: [] })
    useManagerStore.getState().setStatus("SHOW_ROOM", {
      text: "game:waitingForPlayers",
      inviteCode: "123456",
    })
    mocks.handlers.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it("starts the lobby's bed once, as the room opens", () => {
    render(
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "123456" }}
      />,
    )

    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.start).toHaveBeenCalledWith({ scene: "lobby" })
  })

  it("plays a note a step higher for each player who joins", () => {
    render(
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "123456" }}
      />,
    )

    join("p1", "Adaline")
    join("p2", "Grace")

    expect(screen.getByText("Adaline")).toBeTruthy()
    expect(mocks.cue.mock.calls).toEqual([
      [{ cue: "join", index: 0 }],
      [{ cue: "join", index: 1 }],
    ])
  })

  it("keeps the store's player list in step with the seats, so a host leaving a room with players in it is asked first", () => {
    render(
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "123456" }}
      />,
    )

    join("p1", "Adaline")
    join("p2", "Grace")

    const lastCall = useManagerStore.getState().players

    expect(lastCall.map((p) => p.username)).toEqual(["Adaline", "Grace"])
  })

  it("gives a reconnected phone's seat its new id, without a new arrival", () => {
    render(
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "123456" }}
      />,
    )
    join("p1", "Adaline")
    join("p1-back", "Adaline")

    expect(screen.getAllByText("Adaline")).toHaveLength(1)
    expect(mocks.cue).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText("Adaline"))
    fireEvent.click(screen.getByText("game:kick.confirm"))

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.MANAGER.KICK_PLAYER, {
      gameId: "game-1",
      playerId: "p1-back",
    })
  })

  it("only kicks after the host confirms", () => {
    render(
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "123456" }}
      />,
    )
    join("p1", "Adaline")

    fireEvent.click(screen.getByText("Adaline"))

    expect(mocks.emit).not.toHaveBeenCalled()
    expect(screen.getByText("game:kick.title")).toBeTruthy()

    fireEvent.click(screen.getByText("common:cancel"))

    expect(mocks.emit).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText("Adaline"))
    fireEvent.click(screen.getByText("game:kick.confirm"))

    expect(mocks.emit).toHaveBeenCalledWith(EVENTS.MANAGER.KICK_PLAYER, {
      gameId: "game-1",
      playerId: "p1",
    })
  })

  it("shows the join address without its scheme", () => {
    const { container } = render(
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "426 426" }}
      />,
    )

    expect(container.querySelector("[data-join-url]")?.textContent).toBe(
      window.location.host,
    )
  })

  it("puts the PIN on flap cards", () => {
    const { container } = render(
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "426 426" }}
      />,
    )

    expect(
      container.querySelector("[data-flap-pin]")?.getAttribute("data-flap-pin"),
    ).toBe("426 426")
    expect(container.querySelectorAll("[data-flap]")).toHaveLength(6)
  })

  it("draws empty seats for a room that is still filling", () => {
    const { container } = render(
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "123456" }}
      />,
    )

    expect(container.querySelectorAll("[data-seat-empty]")).toHaveLength(12)

    join("p1", "Adaline")

    expect(container.querySelectorAll("[data-player-chip]")).toHaveLength(1)
    expect(container.querySelectorAll("[data-seat-empty]")).toHaveLength(11)
  })

  it("draws sixty seats and counts the players past them", () => {
    // A room that was already full when the host opened this screen.
    useManagerStore.getState().setPlayers(
      Array.from({ length: 64 }, (_, index) => ({
        id: `p${index}`,
        connected: true,
        username: `Player ${index}`,
        points: 0,
        streak: 0,
      })),
    )

    const { container } = render(
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "123456" }}
      />,
    )

    expect(container.querySelectorAll("[data-player-chip]")).toHaveLength(60)
    expect(container.querySelector("[data-seats-more]")?.textContent).toBe(
      "game:seatsMore",
    )
    expect(container.querySelectorAll("[data-seat-empty]")).toHaveLength(0)
  })

  it("shrinks the names as the room fills", () => {
    const { container } = render(
      <OwnedRoom
        data={{ text: "game:waitingForPlayers", inviteCode: "123456" }}
      />,
    )

    join("p0", "Ada")
    const alone = container.querySelector("[data-player-chip]")?.className

    for (let index = 1; index < 40; index += 1) {
      join(`p${index}`, `Player ${index}`)
    }

    const crowded = container.querySelector("[data-player-chip]")?.className

    expect(alone).not.toBe(crowded)
  })
})
