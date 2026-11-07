import type { SceneSpec } from "@razzia/web/features/game/audio"
import { useCallback, useRef } from "react"

/**
 * Keeps a screen's stamped scene on the beat it arrived with, however often the
 * screen asks for it again.
 *
 * The score places a stamped scene from the server clock that came with it, and
 * reads that clock as "sent just now". A screen asking again later with the same
 * payload (the live screen hidden under a lecture review, when the review ends)
 * would have the scene start over: the verdict played twice. `offsetMs` cannot
 * help, since the score ignores it for a stamped scene. So the payload's clock
 * is moved on by the time it has been here: the scene lands where it first did,
 * and what is past stays past. A new payload (a new `serverNow`) starts afresh.
 */
export const useSceneArrival = (
  serverNow: number | undefined,
): ((spec: SceneSpec) => SceneSpec) => {
  const arrival = useRef<{ serverNow: number | undefined; at: number } | null>(
    null,
  )

  return useCallback(
    (spec: SceneSpec): SceneSpec => {
      const now = Date.now()

      if (arrival.current === null || arrival.current.serverNow !== serverNow) {
        arrival.current = { serverNow, at: now }
      }

      const age = now - arrival.current.at

      if (age <= 0 || !("serverNow" in spec)) {
        return spec
      }

      return { ...spec, serverNow: spec.serverNow + age }
    },
    [serverNow],
  )
}
