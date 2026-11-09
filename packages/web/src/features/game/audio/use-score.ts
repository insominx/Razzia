import type { ScoreConfig } from "@razzia/web/features/game/audio/controller"
import { score } from "@razzia/web/features/game/audio/score"
import { useEffect, useLayoutEffect } from "react"

/**
 * Keeps the score's intensity, pack and surface in step with the session. Mount
 * it once where the game's visuals and the "Show intensity" setting are known.
 */
export const useScoreConfig = ({
  intensity,
  theme,
  surface,
}: ScoreConfig): void => {
  // A layout effect, so a screen's own effects (which start its scene) always
  // find the score already set to this session's pack and intensity.
  useLayoutEffect(() => {
    score.configure({ intensity, theme, surface })
  }, [intensity, theme, surface])
}

/** Tells the score which round it is, so it climbs a semitone and adds the final layer. */
export const useScoreRound = (round: number, total: number): void => {
  useEffect(() => {
    score.setRound(round, total)
  }, [round, total])
}
