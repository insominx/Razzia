import { score } from "@razzia/web/features/game/audio/score"
import { useEffect, useRef, useState } from "react"

// Slow while few have voted, quicker as the room fills.
export const HEARTBEAT_BPM = { from: 52, to: 122 } as const

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/** The gap to the next beat, for the share of the room that has voted. */
export const beatMs = (share: number): number =>
  60_000 /
  (HEARTBEAT_BPM.from +
    (HEARTBEAT_BPM.to - HEARTBEAT_BPM.from) * clamp01(share))

/**
 * A poll's heartbeat on the host's screen. It beats while `active` (the poll is
 * open, someone has voted and the room is not all in), each beat a score cue
 * that is stronger and comes sooner as `share` grows. It returns how many
 * beats there have been, for the room's light to breathe on.
 */
export const useHeartbeat = (active: boolean, share: number): number => {
  const [beats, setBeats] = useState(0)
  const latest = useRef(share)

  useEffect(() => {
    latest.current = share
  }, [share])

  useEffect(() => {
    if (!active) {
      return undefined
    }

    let timer: ReturnType<typeof setTimeout> | undefined = undefined

    const beat = () => {
      const now = clamp01(latest.current)

      score.cue({ cue: "beat", strength: 0.55 + 0.45 * now })
      setBeats((count) => count + 1)
      timer = setTimeout(beat, beatMs(now))
    }

    beat()

    return () => {
      clearTimeout(timer)
    }
  }, [active])

  return beats
}
