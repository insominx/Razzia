import { STATUS, type Status } from "@razzia/common/types/game/status"
import { useEffect } from "react"
import { create } from "zustand"

/**
 * The colour of the light behind the show. A mood follows the game's status by
 * default; a screen can hold another for a moment (the last five seconds run
 * warm, a right answer floods green).
 */
export type Mood = "cool" | "teal" | "warm" | "green" | "gold"

export const MOODS: readonly Mood[] = ["cool", "teal", "warm", "green", "gold"]

/** Moods whose light is a pair of beams, for the screens that open the show. */
export const BEAM_MOODS: readonly Mood[] = ["teal", "gold"]

export const moodForStatus = (status: Status | undefined): Mood => {
  if (status === STATUS.SHOW_ROOM || status === STATUS.SHOW_START) {
    return "teal"
  }

  return status === STATUS.FINISHED ? "gold" : "cool"
}

interface MoodStore {
  /** Held by a screen over the status's own mood; `null` lets the status win. */
  override: Mood | null
  setOverride: (mood: Mood | null) => void
}

export const useMoodStore = create<MoodStore>((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
}))

/** Holds `mood` for as long as the calling screen is up (`null` holds nothing). */
export const useMoodOverride = (mood: Mood | null) => {
  useEffect(() => {
    useMoodStore.getState().setOverride(mood)

    return () => {
      useMoodStore.getState().setOverride(null)
    }
  }, [mood])
}
