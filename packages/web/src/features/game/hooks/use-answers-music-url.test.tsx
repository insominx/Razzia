import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { playerState, managerState } = vi.hoisted(() => ({
  playerState: {
    gameId: null as string | null,
    visuals: { soundTheme: undefined as string | undefined },
  },
  managerState: {
    visuals: { soundTheme: undefined as string | undefined },
    config: {
      game: { visuals: { soundTheme: undefined as string | undefined } },
    },
  },
}))

vi.mock("@razzia/web/features/game/stores/player", () => ({
  usePlayerStore: (selector: (state: typeof playerState) => unknown) =>
    selector(playerState),
}))

vi.mock("@razzia/web/features/game/stores/manager", () => ({
  useManagerStore: (selector: (state: typeof managerState) => unknown) =>
    selector(managerState),
}))

describe("useAnswersMusicUrl", () => {
  beforeEach(() => {
    playerState.gameId = null
    playerState.visuals.soundTheme = undefined
    managerState.visuals.soundTheme = undefined
    managerState.config.game.visuals.soundTheme = undefined
  })

  it("uses the player session theme while joined", async () => {
    playerState.gameId = "game-1"
    playerState.visuals.soundTheme = "techno"
    managerState.visuals.soundTheme = "classic"

    const { useAnswersMusicUrl } =
      await import("@razzia/web/features/game/hooks/use-answers-music-url")
    const { result } = renderHook(() => useAnswersMusicUrl())

    expect(result.current).toBe("/sounds/themes/techno/answersMusic.mp3")
  })

  it("uses the manager session theme when not a player", async () => {
    managerState.visuals.soundTheme = "techno"

    const { useAnswersMusicUrl } =
      await import("@razzia/web/features/game/hooks/use-answers-music-url")
    const { result } = renderHook(() => useAnswersMusicUrl())

    expect(result.current).toBe("/sounds/themes/techno/answersMusic.mp3")
  })

  it("uses the manager snapshot and ignores live config", async () => {
    managerState.visuals.soundTheme = "classic"
    managerState.config.game.visuals.soundTheme = "techno"

    const { useAnswersMusicUrl } =
      await import("@razzia/web/features/game/hooks/use-answers-music-url")
    const { result } = renderHook(() => useAnswersMusicUrl())

    expect(result.current).toBe("/sounds/answersMusic.mp3")
  })
})
