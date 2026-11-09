import { useEffect, useMemo, useState } from "react"

const TICK_MS = 250

const secondsLeft = (
  targetMs: number,
  received: { localNow: number; serverNow: number },
): number =>
  Math.max(
    0,
    Math.ceil(
      (targetMs - (received.serverNow + (Date.now() - received.localNow))) /
        1_000,
    ),
  )

/**
 * Whole seconds until a server time, counted on the server's clock: the
 * payload carries `serverNow`, and the gap since it arrived is added from this
 * device's own clock, so a phone with a wrong clock still agrees with the room.
 * Re-stamping `serverNow` (a reconnect) resets the reference.
 */
export const useSecondsUntil = (
  targetMs: number,
  serverNow: number,
  active = true,
): number => {
  const received = useMemo(
    () => ({ localNow: Date.now(), serverNow }),
    // `targetMs` is a reset key: a new reveal re-stamps the receipt time.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [serverNow, targetMs],
  )
  const [seconds, setSeconds] = useState(() => secondsLeft(targetMs, received))

  useEffect(() => {
    if (!active) {
      return
    }

    const update = () => {
      setSeconds(secondsLeft(targetMs, received))
    }

    update()

    const interval = setInterval(update, TICK_MS)

    return () => {
      clearInterval(interval)
    }
  }, [active, received, targetMs])

  return seconds
}
