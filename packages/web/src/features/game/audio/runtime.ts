/**
 * Binds the controller to the real page: Howler's context, the sound store, the
 * game's classic and techno sound files and the wall clock.
 *
 * `constants.ts` is imported here and only used inside functions: it pulls in
 * every game screen, and the screens will import the score, so touching its
 * exports at module load would make that cycle fatal.
 */
import { Howl, Howler } from "howler"
import {
  type ControllerDeps,
  type HowlerLike,
} from "@razzia/web/features/game/audio/controller"
import {
  createLegacyRunner,
  type LegacySfx,
  type LegacySource,
} from "@razzia/web/features/game/audio/legacy"
import { useSoundStore } from "@razzia/web/features/game/stores/sound"
import {
  SFX,
  sfxForTheme,
  sfxVolume,
} from "@razzia/web/features/game/utils/game-constants"
import type { SoundTheme } from "@razzia/common/types/visuals"

const classicPath = (sfx: LegacySfx): string => {
  switch (sfx) {
    case "show":
      return SFX.SHOW_SOUND

    case "music":
      return SFX.ANSWERS.MUSIC

    case "pop":
      return SFX.ANSWERS.SOUND

    case "tick":
      return SFX.BOUMP_SOUND

    case "results":
      return SFX.RESULTS_SOUND

    case "three":
      return SFX.PODIUM.THREE

    case "second":
      return SFX.PODIUM.SECOND

    case "roll":
      return SFX.PODIUM.SNEAR_ROOL

    default:
      return SFX.PODIUM.FIRST
  }
}

/** The pack's file for a sound, at the level the game tuned for it. */
export const legacySource = (
  sfx: LegacySfx,
  theme: SoundTheme,
): LegacySource => {
  const src = sfxForTheme(theme, classicPath(sfx))

  return { src, volume: sfxVolume(src) }
}

export const createRuntimeDeps = (): ControllerDeps => {
  const now = (): number => Date.now()
  const timers = {
    setInterval: (fn: () => void, ms: number): unknown => setInterval(fn, ms),
    clearInterval: (handle: unknown): void => {
      clearInterval(handle as ReturnType<typeof setInterval>)
    },
    setTimeout: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
    clearTimeout: (handle: unknown): void => {
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    },
  }

  return {
    // The singleton itself, so every read sees Howler's current context.
    howler: Howler as unknown as HowlerLike,
    sound: {
      getState: () => useSoundStore.getState(),
      subscribe: (listener) => useSoundStore.subscribe(listener),
    },
    legacy: createLegacyRunner({
      now,
      source: legacySource,
      createHowl: ({ src, volume }, loop) =>
        new Howl({ src: [src], volume, loop }),
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    }),
    now,
    timers,
  }
}
