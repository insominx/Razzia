import { EVENTS } from "@razzia/common/constants"
import Room from "@razzia/web/features/game/components/states/Room"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  pop: vi.fn(),
  handlers: new Map<string, (payload: unknown) => void>(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: mocks.emit } }),
  useEvent: (event: string, callback: (payload: unknown) => void) => {
    mocks.handlers.set(event, callback)
  },
}))

vi.mock("@razzia/web/features/game/stores/manager", () => ({
  useManagerStore: () => ({ gameId: "game-1", players: [] }),
}))

vi.mock("@razzia/web/features/game/hooks/use-sfx", () => ({
  useSfx: () => (path: string) => path,
}))

vi.mock("use-sound", () => ({
  default: () => [mocks.pop, { stop: vi.fn() }],
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
    mocks.handlers.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it("pops when a player joins", () => {
    render(
      <Room data={{ text: "game:waitingForPlayers", inviteCode: "123456" }} />,
    )

    join("p1", "Adaline")

    expect(screen.getByText("Adaline")).toBeTruthy()
    expect(mocks.pop).toHaveBeenCalledTimes(1)
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
})
