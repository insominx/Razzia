/**
 * Vibration patterns (ms) for phone players, who start muted and otherwise get
 * no physical confirmation that a tap landed.
 */
export const HAPTIC = {
  tap: [15],
  correct: [40],
  wrong: [70, 60, 70],
} as const

/**
 * Best-effort vibration. A no-op where the Vibration API is missing (iOS
 * Safari, most desktops); some browsers throw instead of returning `false`
 * before the page has had a user gesture.
 */
export const haptic = (pattern: readonly number[]) => {
  if (!("vibrate" in navigator)) {
    return
  }

  try {
    navigator.vibrate([...pattern])
  } catch {
    // Vibration is decoration; never let it break the tap that triggered it.
  }
}
