/**
 * The legacy adapter: the same scene and cue calls, played as the classic and
 * techno mp3 packs.
 *
 * What the old screens did with `use-sound` is kept: the question's `show`
 * sound, the answers bed looping while answers are open, a pop per answer, a
 * `boump` tick, `results`, and the podium's three/second/roll/first. What
 * changes is the lifetime: nothing is loaded until it is about to play, nothing
 * is ever created while the page is muted or suppressed, and a file is
 * unloaded when its scene ends, when the pack changes, and after a quiet spell.
 * (`use-sound` preloaded up to 2.9 MB on every phone, muted or not.)
 *
 * This file has no import of the game's constants or of Howler: the paths, the
 * per-pack levels and the real `Howl` arrive through `LegacyDeps`, so it can be
 * tested without either.
 */
import { NO_TIME_LIMIT } from "@razzia/common/constants"
import type { SoundTheme } from "@razzia/common/types/visuals"
import type { Anchor, Lane } from "@razzia/web/features/game/audio/music"
import {
  CALM_MUSIC_DB,
  type Cue,
  HOST_ONLY_CUES,
  type Intensity,
  type SceneSpec,
  type Surface,
} from "@razzia/web/features/game/audio/scenes"

export type LegacySfx =
  | "show"
  | "music"
  | "pop"
  | "tick"
  | "results"
  | "three"
  | "second"
  | "roll"
  | "first"

export interface LegacyEvent {
  /** Seconds from the plan's anchor. */
  t: number
  sfx: LegacySfx
  /** For a loop or a roll: when it stops, in the same seconds. */
  until?: number
  /** Plays when the plan starts, whatever its anchor says. */
  onStart?: boolean
}

export interface LegacyPlan {
  lane: Lane
  key: string
  anchor: Anchor | null
  /** Lanes whose sounds stop when this plan starts. */
  cuts: readonly Lane[]
  events: readonly LegacyEvent[]
}

export interface LegacyOptions {
  intensity: Intensity
  surface: Surface
}

const LAST_SECONDS = 5

const ticks = (timeS: number): LegacyEvent[] =>
  Array.from({ length: LAST_SECONDS }, (_, k) => ({
    t: timeS - LAST_SECONDS + k,
    sfx: "tick" as const,
  })).filter((event) => event.t >= 0)

const plan = (
  lane: Lane,
  spec: SceneSpec,
  rest: Partial<Pick<LegacyPlan, "cuts" | "events">> & {
    anchor: Anchor | null
  },
): LegacyPlan => ({
  lane,
  key: `${spec.scene}|${rest.anchor?.stamp ?? ""}`,
  anchor: rest.anchor,
  cuts: rest.cuts ?? [],
  events: rest.events ?? [],
})

const podiumPlan = (places: number): LegacyEvent[] => {
  // The old podium revealed one place every two seconds: third, second, the
  // roll, then first with the roll cut; with fewer than three it went straight
  // to first.
  if (places < 3) {
    return [{ t: 0, sfx: "first" }]
  }

  return [
    { t: 2, sfx: "three" },
    { t: 4, sfx: "second" },
    { t: 6, sfx: "roll", until: 8 },
    { t: 8, sfx: "first" },
  ]
}

const answersPlan = (
  spec: Extract<SceneSpec, { scene: "answers" }>,
  anchor: Anchor | null,
): LegacyPlan => {
  const timed = spec.time !== NO_TIME_LIMIT && spec.time > 0

  return plan("bed", spec, {
    anchor,
    events: [
      { t: 0, sfx: "music", until: timed ? spec.time : undefined },
      ...(timed ? ticks(spec.time) : []),
    ],
  })
}

// The old results screen: the sound once, and the answers bed stops.
const resultsPlan = (spec: SceneSpec, anchor: Anchor | null): LegacyPlan =>
  plan("verdict", spec, {
    anchor,
    cuts: ["bed"],
    events: [{ t: 0, sfx: "results" }],
  })

/** What the old pack plays for a scene, or null when it had nothing there. */
export const legacyPlan = (
  spec: SceneSpec,
  anchor: Anchor | null,
  options: LegacyOptions,
): LegacyPlan | null => {
  if (options.intensity === "silent") {
    return null
  }

  const host = options.surface === "host"

  switch (spec.scene) {
    case "lamps":
      return host
        ? plan("show", spec, {
            anchor,
            events: [0, 1, 2].map((t) => ({ t, sfx: "tick" as const })),
          })
        : null

    case "reading":
      // The question's sound plays as the screen arrives, as it always has.
      return plan("bed", spec, {
        anchor,
        events: [{ t: 0, sfx: "show", onStart: true }],
      })

    case "answers":
      return answersPlan(spec, anchor)

    case "verdict":
      return resultsPlan(spec, anchor)

    case "time":
      return resultsPlan(spec, anchor)

    // A phone starts only the strike, so it is what stops the answers bed there.
    case "strike":
      return plan("verdict", spec, { anchor, cuts: ["bed"] })

    case "podium":
      return host
        ? plan("show", spec, {
            anchor,
            cuts: ["bed", "verdict"],
            events: podiumPlan(spec.places ?? 3),
          })
        : null

    case "leaderboard":
      return host
        ? plan("bed", spec, {
            anchor,
            cuts: ["verdict"],
          })
        : null

    default:
      return null
  }
}

const CUE_SFX: Partial<Record<Cue["cue"], LegacySfx>> = {
  join: "pop",
  pop: "pop",
  tick: "tick",
  lamp: "tick",
  roll: "roll",
}

const PLACE_SFX = { 1: "first", 2: "second", 3: "three" } as const

/** The old pack's sound for a cue, or null. */
export const legacyCue = (
  cue: Cue,
  options: LegacyOptions,
): LegacyEvent | null => {
  if (options.intensity === "silent") {
    return null
  }

  // The same rule as the show pack: a phone does not play the room's joins or
  // the podium's places and roll.
  if (options.surface === "player" && HOST_ONLY_CUES.has(cue.cue)) {
    return null
  }

  if (cue.cue === "place") {
    return { t: 0, sfx: PLACE_SFX[cue.place] }
  }

  const sfx = CUE_SFX[cue.cue]

  if (!sfx) {
    return null
  }

  return {
    t: 0,
    sfx,
    until: cue.cue === "roll" ? cue.ms / 1000 : undefined,
  }
}

export interface HowlLike {
  play: () => unknown
  stop: () => void
  unload: () => void
  playing: () => boolean
}

export interface LegacySource {
  src: string
  volume: number
}

export interface LegacyDeps {
  now: () => number
  /** The path and tuned level for a sound under a pack. */
  source: (sfx: LegacySfx, theme: SoundTheme) => LegacySource
  createHowl: (source: LegacySource, loop: boolean) => HowlLike
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

/** After this long with nothing played, every idle file is unloaded. */
export const IDLE_UNLOAD_MS = 15_000

/** A one-shot this far overdue is dropped rather than played late. */
const LATE_MS = 250

const dbToGain = (db: number): number => 10 ** (db / 20)

export interface LegacyRunner {
  /** Switches pack. Everything loaded under the old one is unloaded. */
  setTheme: (theme: SoundTheme) => void
  /** Starts a plan whose t = 0 is local time `originMs`, replacing its lane. */
  start: (plan: LegacyPlan, originMs: number, intensity: Intensity) => void
  cue: (event: LegacyEvent, intensity: Intensity) => void
  stop: (lane?: Lane) => void
  /** The page went quiet: stop, cancel and unload all. */
  unloadAll: () => void
  /** Files currently held, for tests. */
  loaded: () => readonly string[]
}

interface Request {
  event: LegacyEvent
  timing: Timing
  intensity: Intensity
}

interface Timing {
  delayMs: number
  /** When it stops, in ms from now; null to play out. */
  stopMs: number | null
}

const LANES = ["bed", "show", "verdict"] as const

export const createLegacyRunner = (deps: LegacyDeps): LegacyRunner => {
  const howls = new Map<string, HowlLike>()
  const laneTimers = new Map<Lane, Set<unknown>>()
  const laneLoops = new Map<Lane, Set<string>>()
  let theme: SoundTheme = "classic"
  let idleTimer: unknown = undefined

  const armIdle = (): void => {
    if (idleTimer !== undefined) {
      deps.clearTimeout(idleTimer)
    }

    idleTimer = deps.setTimeout(() => {
      idleTimer = undefined

      for (const [key, howl] of [...howls]) {
        if (!howl.playing()) {
          howl.unload()
          howls.delete(key)
        }
      }
    }, IDLE_UNLOAD_MS)
  }

  const keyOf = (sfx: LegacySfx, gain: number): string =>
    `${deps.source(sfx, theme).src}|${gain}`

  // Created here, on the first play, never earlier.
  const obtain = (sfx: LegacySfx, gain: number) => {
    const key = keyOf(sfx, gain)
    const existing = howls.get(key)

    if (existing) {
      return { key, howl: existing }
    }

    const source = deps.source(sfx, theme)
    const howl = deps.createHowl(
      { src: source.src, volume: source.volume * gain },
      sfx === "music",
    )

    howls.set(key, howl)

    return { key, howl }
  }

  const play = (event: LegacyEvent, intensity: Intensity): string | null => {
    const loop = event.sfx === "music"
    const gain = loop && intensity === "calm" ? dbToGain(CALM_MUSIC_DB) : 1
    const { key, howl } = obtain(event.sfx, gain)

    if (loop) {
      howl.stop()
    }

    howl.play()
    armIdle()

    return loop ? key : null
  }

  // Stops a sound only if it is already loaded; stopping never loads.
  const stopSfx = (sfx: LegacySfx): void => {
    const prefix = `${deps.source(sfx, theme).src}|`

    for (const [key, howl] of howls) {
      if (key.startsWith(prefix)) {
        howl.stop()
      }
    }
  }

  const unloadKey = (key: string): void => {
    const howl = howls.get(key)

    howl?.stop()
    howl?.unload()
    howls.delete(key)
  }

  const later = (lane: Lane, ms: number, fn: () => void): void => {
    const timers = laneTimers.get(lane) ?? new Set<unknown>()
    const handle = deps.setTimeout(
      () => {
        timers.delete(handle)
        fn()
      },
      Math.max(0, ms),
    )

    timers.add(handle)
    laneTimers.set(lane, timers)
  }

  const stopLane = (lane: Lane): void => {
    for (const handle of laneTimers.get(lane) ?? []) {
      deps.clearTimeout(handle)
    }

    laneTimers.delete(lane)

    // A bed that is still looping goes with its scene: its file is the big one.
    for (const key of laneLoops.get(lane) ?? []) {
      unloadKey(key)
    }

    laneLoops.delete(lane)
  }

  const startLoop = (lane: Lane, request: Request): void => {
    const { event, timing, intensity } = request

    later(lane, timing.delayMs, () => {
      const key = play(event, intensity)

      if (key) {
        const keys = laneLoops.get(lane) ?? new Set<string>()

        keys.add(key)
        laneLoops.set(lane, keys)
      }
    })

    if (timing.stopMs !== null) {
      later(lane, timing.stopMs, () => {
        stopLane(lane)
      })
    }
  }

  const startOneShot = (lane: Lane, request: Request): void => {
    const { event, timing, intensity } = request

    later(lane, timing.delayMs, () => {
      play(event, intensity)

      if (timing.stopMs !== null) {
        later(lane, timing.stopMs - timing.delayMs, () => {
          stopSfx(event.sfx)
        })
      }
    })
  }

  const unloadEverything = (): void => {
    for (const lane of LANES) {
      stopLane(lane)
    }

    if (idleTimer !== undefined) {
      deps.clearTimeout(idleTimer)
      idleTimer = undefined
    }

    for (const howl of howls.values()) {
      howl.stop()
      howl.unload()
    }

    howls.clear()
  }

  return {
    setTheme: (next) => {
      if (next !== theme) {
        unloadEverything()
        theme = next
      }
    },

    start: (next, originMs, intensity) => {
      for (const lane of [next.lane, ...next.cuts]) {
        stopLane(lane)
      }

      const nowMs = deps.now()

      for (const event of next.events) {
        const due = event.onStart ? nowMs : originMs + event.t * 1000
        const stopMs =
          event.until === undefined
            ? null
            : originMs + event.until * 1000 - nowMs
        const timing = { delayMs: due - nowMs, stopMs }

        // A loop is a bed, so joining it late is right. A hit that has already
        // gone by is not replayed.
        if (event.sfx === "music") {
          if (stopMs === null || stopMs > 0) {
            startLoop(next.lane, { event, timing, intensity })
          }
        } else if (timing.delayMs >= -LATE_MS) {
          startOneShot(next.lane, { event, timing, intensity })
        }
      }
    },

    cue: (event, intensity) => {
      play(event, intensity)

      if (event.until !== undefined) {
        deps.setTimeout(() => {
          stopSfx(event.sfx)
        }, event.until * 1000)
      }
    },

    stop: (lane) => {
      if (lane) {
        stopLane(lane)

        return
      }

      for (const each of LANES) {
        stopLane(each)
      }
    },

    unloadAll: unloadEverything,

    loaded: () => [...howls.keys()],
  }
}
