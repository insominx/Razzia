import {
  getNextResultBoundary,
  getResultElapsed,
  getResultPhase,
  type ResultPhase,
  RESULT_SETTLED_MS,
} from "@razzia/common/utils/result-reveal"
import { useEffect, useMemo, useState } from "react"

const TICK_MS = 50

interface Stamps {
  resultsAt?: number
  serverNow?: number
}

export interface ResultClock {
  /** How far into the staged verdict this screen is. */
  elapsedMs: number
  phase: ResultPhase
  settled: boolean
}

const clockAt = (elapsedMs: number): ResultClock => ({
  elapsedMs,
  phase: getResultPhase(elapsedMs),
  settled: elapsedMs >= RESULT_SETTLED_MS,
})

/**
 * Where a screen is in the staged verdict, on the server's clock. The payload
 * carries `resultsAt` (when answering ended) and `serverNow` (when it was sent);
 * the time since it arrived is added from this device's clock. A payload with
 * no stamps, or one that arrives after the reveal has ended, is settled from
 * its first frame: no flood, no count, nothing to replay. Re-stamping
 * `serverNow` (a reconnect) resets the reference.
 *
 * It ticks a few times a second only while a beat is still to come, with a
 * timer and not `requestAnimationFrame`: a hidden frame stops getting frames,
 * and the beats must still land on time when it is shown.
 */
export const useResultClock = (stamps: Stamps): ResultClock => {
  const received = useMemo(
    () => ({ localNow: Date.now() }),
    // A new stamp is a new reveal: it restarts the local reference.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [stamps.resultsAt, stamps.serverNow],
  )
  const elapsed = () => getResultElapsed(stamps, Date.now() - received.localNow)
  const [clock, setClock] = useState<ResultClock>(() => clockAt(elapsed()))

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (interval !== null) {
        clearInterval(interval)
        interval = null
      }
    }

    const update = () => {
      const next = clockAt(elapsed())

      setClock(next)

      if (getNextResultBoundary(next.elapsedMs) === null) {
        stop()
      }
    }

    update()

    if (getNextResultBoundary(elapsed()) !== null) {
      interval = setInterval(update, TICK_MS)
    }

    return stop
    // `elapsed` closes over `stamps` and `received`, which are the dependencies.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [stamps.resultsAt, stamps.serverNow, received])

  return clock
}
