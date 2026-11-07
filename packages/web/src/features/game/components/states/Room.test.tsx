import { EVENTS } from "@razzia/common/constants"
import Room from "@razzia/web/features/game/components/states/Room"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  start: vi.fn(),
  cue: vi.fn(),
  players: [] as unknown[],
  handlers: new Map<string, (payload: unknown) => void>(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit } }),
  useEvent: (event: string, callback: (payload: unknown) => void) => {
    mocks.handlers.set(event, callback)
  },
}))

vi.mock("@razzia/web/features/game/stores/manager", () => ({
  useManagerStore: () => ({ gameId: "game-1", players: mocks.players }),
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
    mocks.handlers.get(EVENTS.MANAGER.NEW_PLAYER)?.({
      id,
      clientId: `client-${id}`,
      connected: true,
      username,
      points: 0,
      streak: 0,
    })
  })
}

describe("Room lobby", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.players = []
    mocks.handlers.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it("starts the lobby's bed once, as the room opens", () => {
    render(
      <Room data={{ text: "game:waitingForPlayers", inviteCode: "123456" }} />,
    )

    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.start).toHaveBeenCalledWith({ scene: "lobby" })
  })

  it("plays a note a step higher for each player who joins", () => {
    render(
      <Room data={{ text: "game:waitingForPlayers", inviteCode: "123456" }} />,
    )

    join("p1", "Adaline")
    join("p2", "Grace")

    expect(screen.getByText("Adaline")).toBeTruthy()
    expect(mocks.cue.mock.calls).toEqual([
      [{ cue: "join", index: 0 }],
      [{ cue: "join", index: 1 }],
    ])
  })

  it("only kicks after the host confirms", () => {
    render(
      <Room data={{ text: "game:waitingForPlayers", inviteCode: "123456" }} />,
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
      <Room data={{ text: "game:waitingForPlayers", inviteCode: "426 426" }} />,
    )

    expect(container.querySelector("[data-join-url]")?.textContent).toBe(
      window.location.host,
    )
  })

  it("puts the PIN on flap cards", () => {
    const { container } = render(
      <Room data={{ text: "game:waitingForPlayers", inviteCode: "426 426" }} />,
    )

    expect(
      container.querySelector("[data-flap-pin]")?.getAttribute("data-flap-pin"),
    ).toBe("426 426")
    expect(container.querySelectorAll("[data-flap]")).toHaveLength(6)
  })

  it("draws empty seats for a room that is still filling", () => {
    const { container } = render(
      <Room data={{ text: "game:waitingForPlayers", inviteCode: "123456" }} />,
    )

    expect(container.querySelectorAll("[data-seat-empty]")).toHaveLength(12)

    join("p1", "Adaline")

    expect(container.querySelectorAll("[data-player-chip]")).toHaveLength(1)
    expect(container.querySelectorAll("[data-seat-empty]")).toHaveLength(11)
  })

  it("draws sixty seats and counts the players past them", () => {
    // A room that was already full when the host opened this screen.
    mocks.players = Array.from({ length: 64 }, (_, index) => ({
      id: `p${index}`,
      connected: true,
      username: `Player ${index}`,
      points: 0,
      streak: 0,
    }))

    const { container } = render(
      <Room data={{ text: "game:waitingForPlayers", inviteCode: "123456" }} />,
    )

    expect(container.querySelectorAll("[data-player-chip]")).toHaveLength(60)
    expect(container.querySelector("[data-seats-more]")?.textContent).toBe(
      "game:seatsMore",
    )
    expect(container.querySelectorAll("[data-seat-empty]")).toHaveLength(0)
  })

  it("shrinks the names as the room fills", () => {
    const { container } = render(
      <Room data={{ text: "game:waitingForPlayers", inviteCode: "123456" }} />,
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
