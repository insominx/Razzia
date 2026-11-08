import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { describe, expect, it, vi } from "vitest"

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  socketClient: { emit: vi.fn(), connected: false },
  useEvent: vi.fn(),
  useSocket: () => ({ socket: { emit: vi.fn() } }),
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => vi.fn(),
  useParams: () => ({ gameId: "g1" }),
}))

describe("player game route", () => {
  it("forgets the player and game when it is left", async () => {
    const { Route } = await import("@razzia/web/pages/party/$gameId")
    usePlayerStore.setState({
      gameId: "g1",
      player: { username: "Ann", points: 0 },
    })
    useQuestionStore.setState({ questionStates: { current: 1, total: 2 } })
    ;(
      Route as unknown as {
        options: { onLeave: (_match: { params: { gameId: string } }) => void }
      }
    ).options.onLeave({ params: { gameId: "g1" } })

    expect(usePlayerStore.getState().player).toBeNull()
    expect(usePlayerStore.getState().gameId).toBeNull()
    expect(useQuestionStore.getState().questionStates).toBeNull()
  })
})
