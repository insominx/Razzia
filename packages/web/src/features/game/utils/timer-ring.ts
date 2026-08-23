/**
 * Countdown ring geometry. The server ticks `game:cooldown` once a second, so
 * the component transitions between the offsets these return rather than
 * animating a clock of its own.
 */

export const RING_RADIUS = 20

export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * Fraction of the ring still to draw, clamped to `[0, 1]`. A zero or negative
 * total means there is nothing to count down, so the ring stays full.
 */
export const ringProgress = (remaining: number, total: number): number => {
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) {
    return 1
  }

  return Math.min(1, Math.max(0, remaining / total))
}

/**
 * `stroke-dashoffset` for a ring of `circumference`: 0 when full, the whole
 * circumference when spent.
 */
export const ringDashOffset = (
  remaining: number,
  total: number,
  circumference: number = RING_CIRCUMFERENCE,
): number => circumference * (1 - ringProgress(remaining, total))
