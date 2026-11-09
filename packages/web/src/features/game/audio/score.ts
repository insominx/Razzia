import {
  createScore,
  type Score,
} from "@razzia/web/features/game/audio/controller"
import { createRuntimeDeps } from "@razzia/web/features/game/audio/runtime"

let instance: Score | null = null

/**
 * Built on first use, not at import: the screens that call it are themselves
 * imported (through the game's constants) by the very modules the score's
 * runtime needs, and a score built while that cycle is still loading would find
 * half of its dependencies missing.
 */
const live = (): Score => {
  instance ??= createScore(createRuntimeDeps())

  return instance
}

/**
 * The show's score: adaptive, scene-based WebAudio through Howler's master
 * gain, or the classic and techno mp3 packs through the legacy adapter. Screens
 * call `score.start(...)` and `score.cue(...)`; they never touch an
 * AudioContext. See `scenes.ts` for every scene and what each one needs.
 */
export const score: Score = {
  configure: (config) => live().configure(config),
  start: (spec, options) => live().start(spec, options),
  stop: (lane, fadeS) => live().stop(lane, fadeS),
  cue: (cue, options) => live().cue(cue, options),
  setRound: (round, total) => live().setRound(round, total),
  dispose: () => {
    // Nothing built means nothing to dispose of.
    instance?.dispose()
    instance = null
  },
  debug: () => live().debug(),
}
