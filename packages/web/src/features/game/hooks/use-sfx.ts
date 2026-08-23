import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { sfxForTheme } from "@razzia/web/features/game/utils/constants"
import { useCallback } from "react"

/**
 * Resolves classic `SFX.*` paths to the sound pack of the running session.
 *
 * The theme comes from the session snapshot taken at `GAME.CREATE` — the
 * player store while joined, the manager store otherwise — never from the live
 * `config.game.visuals`, so switching the pack mid-game cannot swap cues under
 * the players.
 */
export const useSfx = (): ((classicPath: string) => string) => {
  const playerGameId = usePlayerStore((s) => s.gameId)
  const playerTheme = usePlayerStore((s) => s.visuals.soundTheme)
  const managerTheme = useManagerStore((s) => s.visuals.soundTheme)

  const theme = playerGameId ? playerTheme : managerTheme

  return useCallback(
    (classicPath: string) => sfxForTheme(theme, classicPath),
    [theme],
  )
}
