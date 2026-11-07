import {
  type InstrumentName,
  type InstrumentParams,
  mix,
  S16,
  type SceneEvent,
} from "@razzia/web/features/game/audio/instruments"

export { mix }

/** Am F C G: root, then the voicing a pad or stab plays. */
export const CHORDS = [
  [45, 57, 60, 64],
  [41, 57, 60, 65],
  [48, 55, 60, 64],
  [43, 55, 59, 62],
] as const

/** C G Am F: the lifted progression the finale uses. */
export const LIFT = [
  [48, 60, 64, 67],
  [43, 59, 62, 67],
  [45, 60, 64, 69],
  [41, 60, 65, 69],
] as const

/** A minor pentatonic, climbing: joins and answers walk up it. */
export const PENT = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93] as const

/** One note per answer as it powers on. */
export const POWER_NOTES = [69, 72, 74, 76] as const

/** The start lamps' notes. */
export const LAMP_NOTES = [69, 72, 76] as const

/** The last five seconds climb this scale, one tick a second. */
export const TICK_SCALE = [81, 84, 86, 88, 93] as const

export const mod = (n: number, m: number): number => ((n % m) + m) % m

export const floorDiv = (n: number, m: number): number => Math.floor(n / m)

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/** Where `t` sits between `a` and `b`, clamped to 0..1. */
export const progress = (t: number, a: number, b: number): number =>
  clamp01((t - a) / (b - a))

export type Lane = "bed" | "show" | "verdict"

/** A scene's anchor: a server stamp and the server clock that came with it. */
export interface Anchor {
  stamp: number
  serverNow: number
}

/** Another lane to fade out when this scene starts. */
export interface Cut {
  lane: Lane
  fadeS: number
}

/** Events whose start lies in `[from, to)` seconds from the scene's anchor. */
export type Source = (from: number, to: number) => SceneEvent[]

export interface Scene {
  readonly name: string
  readonly lane: Lane
  /** Identity: a second `start` with the same live key is a no-op. */
  readonly key: string
  /** Null for scenes that start "now" (or `offsetMs` ago). */
  readonly anchor: Anchor | null
  /** Seconds after the anchor at which no further event starts. */
  readonly end: number
  /** How long the last event can keep ringing after `end`. */
  readonly tail: number
  /** Lanes to fade when this scene starts. */
  readonly cuts: readonly Cut[]
  /** Fade given to the scene this one replaces in its lane. */
  readonly crossfadeS: number
  readonly events: Source
}

/** What a scene is built with: the round's pitch and the intensity. */
export interface Ctx {
  /** Semitones the whole score is raised, 0 for the first round. */
  rise: number
  calm: boolean
  /** The last question adds a layer. */
  final: boolean
  /** Phones skip the projector-only beats. */
  host: boolean
}

export const tr = (c: Ctx, note: number): number => note + c.rise

export const trAll = (c: Ctx, notes: readonly number[]): number[] =>
  notes.map((note) => note + c.rise)

export const ev = <K extends InstrumentName>(
  t: number,
  inst: K,
  p: InstrumentParams[K],
): SceneEvent => ({ t, inst, p }) as SceneEvent

/** A fixed list of events. */
export const fixed =
  (events: readonly SceneEvent[]): Source =>
  (from, to) =>
    events.filter((e) => e.t >= from && e.t < to)

/**
 * Events generated per sixteenth-note step, `i` counted from the anchor (and
 * negative before it). A step belongs to the window holding its start time, so
 * consecutive windows never repeat or skip one.
 */
export const stepped =
  (stepEvents: (i: number) => SceneEvent[], until = Infinity): Source =>
  (from, to) => {
    const events: SceneEvent[] = []
    const last = Math.min(to, until)

    for (let i = Math.ceil(from / S16); i * S16 < last; i += 1) {
      events.push(...stepEvents(i))
    }

    return events
  }

/**
 * The only events calm drops: the full-frame hits and the noise sweeps that
 * build to them.
 */
const CALM_DROPS: ReadonlySet<InstrumentName> = new Set([
  "impact",
  "crash",
  "riser",
])

export const isCalmDrop = (inst: InstrumentName): boolean =>
  CALM_DROPS.has(inst)

export interface SceneDef {
  name: string
  lane: Lane
  key: string
  anchor?: Anchor
  end: number
  tail?: number
  cuts?: readonly Cut[]
  crossfadeS?: number
}

export const makeScene = (
  c: Ctx,
  def: SceneDef,
  sources: readonly Source[],
): Scene => {
  const { name, lane, key, end } = def

  return {
    name,
    lane,
    key,
    end,
    anchor: def.anchor ?? null,
    tail: def.tail ?? 3.5,
    cuts: def.cuts ?? [],
    crossfadeS: def.crossfadeS ?? 0,
    events: (from, to) => {
      const events = sources.flatMap((source) => source(from, to))

      return c.calm ? events.filter((e) => !isCalmDrop(e.inst)) : events
    },
  }
}
