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

const renderSfx = async () => {
  const { useSfx } = await import("@razzia/web/features/game/hooks/use-sfx")

  return renderHook(() => useSfx())
}

describe("useSfx", () => {
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

    const { result } = await renderSfx()

    expect(result.current("/sounds/answersMusic.mp3")).toBe(
      "/sounds/themes/techno/answersMusic.mp3",
    )
  })

  it("uses the manager session theme when not a player", async () => {
    managerState.visuals.soundTheme = "techno"

    const { result } = await renderSfx()

    expect(result.current("/sounds/answersMusic.mp3")).toBe(
      "/sounds/themes/techno/answersMusic.mp3",
    )
  })

  it("uses the manager snapshot and ignores live config", async () => {
    managerState.visuals.soundTheme = "classic"
    managerState.config.game.visuals.soundTheme = "techno"

    const { result } = await renderSfx()

    expect(result.current("/sounds/answersMusic.mp3")).toBe(
      "/sounds/answersMusic.mp3",
    )
  })

  it("themes every cue, not just the answers music", async () => {
    managerState.visuals.soundTheme = "techno"

    const { result } = await renderSfx()

    expect(
      [
        "/sounds/answersSound.mp3",
        "/sounds/boump.mp3",
        "/sounds/show.mp3",
        "/sounds/results.mp3",
        "/sounds/three.mp3",
        "/sounds/second.mp3",
        "/sounds/snearRoll.mp3",
        "/sounds/first.mp3",
      ].map((cue) => result.current(cue)),
    ).toEqual([
      "/sounds/themes/techno/answersSound.mp3",
      "/sounds/themes/techno/boump.mp3",
      "/sounds/themes/techno/show.mp3",
      "/sounds/themes/techno/results.mp3",
      "/sounds/themes/techno/three.mp3",
      "/sounds/themes/techno/second.mp3",
      "/sounds/themes/techno/snearRoll.mp3",
      "/sounds/themes/techno/first.mp3",
    ])
  })
})
