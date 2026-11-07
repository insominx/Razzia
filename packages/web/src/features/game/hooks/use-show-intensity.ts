import {
  DEFAULT_SHOW_INTENSITY,
  type ShowIntensity,
} from "@razzia/common/types/visuals"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useReducedMotion } from "motion/react"

/**
 * The show's intensity for the session on screen.
 *
 * Like the sound theme, it comes from the snapshot taken at `GAME.CREATE`: the
 * player store while joined, the manager store otherwise, never the live
 * config, so changing the setting mid-game cannot change the show under the
 * players.
 */
export const useShowIntensity = (): ShowIntensity => {
  const playerGameId = usePlayerStore((s) => s.gameId)
  const playerIntensity = usePlayerStore((s) => s.visuals.showIntensity)
  const managerIntensity = useManagerStore((s) => s.visuals.showIntensity)

  return (
    (playerGameId ? playerIntensity : managerIntensity) ??
    DEFAULT_SHOW_INTENSITY
  )
}

/**
 * Whether to leave out the full-frame hits, the spotlight, the beams and the
 * embers: Calm and Silent say so, and so does a device set to reduced motion
 * (which also drops the count animation).
 */
export const useCalmVisuals = (): boolean => {
  const intensity = useShowIntensity()
  const reducedMotion = useReducedMotion()

  return intensity !== DEFAULT_SHOW_INTENSITY || Boolean(reducedMotion)
}
