/**
 * The scheduler: turns scenes into audio-time events.
 *
 * It owns no timer of its own. The controller calls `pump()` about every 25 ms
 * and the engine schedules, on the AudioContext clock, every voice that falls
 * inside a short look-ahead. Scenes are placed by wall-clock stamps (the server
 * time a beat is due, converted to a local `Date.now()` origin), and each event
 * is mapped to audio time through a (wall, audio) anchor pair that is measured
 * again whenever the two clocks drift apart or the context sleeps and wakes.
 * Nothing in the past is replayed: an event that is overdue by more than its
 * tolerance is skipped, so a scene that starts late joins mid-bar without a hit.
 */
import {
  type Bus,
  createLaneBus,
  type Graph,
  type InstrumentName,
  type LaneBus,
  playEvent,
  type SceneEvent,
} from "@razzia/web/features/game/audio/instruments"
import type { Lane, Scene } from "@razzia/web/features/game/audio/music"

/** How often the controller calls `pump()`. */
export const PUMP_MS = 25

/** How far ahead of `now` events are handed to the AudioContext. */
export const LOOKAHEAD_S = 0.2

/** Wall and audio clocks may differ by this much before the pair is re-measured. */
export const DRIFT_S = 0.03

/** The most any event may be overdue and still play. */
export const MAX_LATE_S = 0.6

const DEFAULT_LATE_S = 0.12

/**
 * Hits and cues are worth playing a little late: the screen that triggered
 * them is late by the same message and render delay, so they still land
 * together. Grooves are not: a hat 300 ms late is just noise.
 */
const LATE_S: Partial<Record<InstrumentName, number>> = {
  impact: MAX_LATE_S,
  crash: MAX_LATE_S,
  chord: MAX_LATE_S,
  clunk: 0.35,
  tick: 0.25,
  swell: 0.35,
  whoosh: 0.25,
  roll: 0.35,
  riser: 0.35,
}

export const lateToleranceS = (inst: InstrumentName): number =>
  LATE_S[inst] ?? DEFAULT_LATE_S

/** Where a cue's first voice sits after "now", so it is never scheduled in the past. */
const CUE_LEAD_S = 0.01

export interface EngineDeps {
  ctx: BaseAudioContext
  graph: Graph
  /** Wall-clock epoch milliseconds. */
  now: () => number
  /** Replaced in tests; defaults to the real voices. */
  play?: (bus: Bus, event: SceneEvent, when: number) => void
  /** Trim in dB for a lane's bus (the controller maps intensity to this). */
  levelDb?: (lane: Lane | "cue") => number
  /** Offline renders have no live clock to track. */
  fixedClock?: boolean
  /** Disposal timers; offline renders must not tear nodes down mid-render. */
  timers?: {
    set: (fn: () => void, ms: number) => unknown
    clear: (handle: unknown) => void
  }
}

interface Running {
  scene: Scene
  bus: LaneBus
  originMs: number
  /** Scene seconds already handed to the context. */
  cursor: number
  ended: boolean
  retire: unknown
}

export interface Engine {
  /**
   * Starts a scene whose t = 0 is local time `originMs`. Returns false when the
   * same scene is already live in its lane.
   */
  start: (scene: Scene, originMs: number) => boolean
  /** Plays voices now; their `t` are seconds after this call. */
  cue: (events: readonly SceneEvent[]) => void
  /** Schedules everything due within `horizonS`. Returns whether work remains. */
  pump: (horizonS?: number) => boolean
  hasWork: () => boolean
  /** Fades one lane, or every lane and the cues, over `fadeS`. */
  stop: (lane?: Lane, fadeS?: number) => void
  /** Keys of the scenes currently live, by lane. */
  live: () => Partial<Record<Lane, string>>
  dispose: () => void
}

const defaultTimers = {
  set: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
  clear: (handle: unknown): void => {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  },
}

export const createEngine = (deps: EngineDeps): Engine => {
  const { ctx, graph, now } = deps
  const play = deps.play ?? playEvent
  const levelDb = deps.levelDb ?? ((): number => 0)
  const timers = deps.timers ?? defaultTimers
  const lanes = new Map<Lane, Running>()
  let anchor = { wall: now(), audio: ctx.currentTime }
  let cueBus: LaneBus | null = null

  const audioAt = (wallMs: number): number =>
    anchor.audio + (wallMs - anchor.wall) / 1000

  const track = (nowMs: number): void => {
    if (deps.fixedClock) {
      return
    }

    const drift = ctx.currentTime - anchor.audio - (nowMs - anchor.wall) / 1000

    if (Math.abs(drift) > DRIFT_S) {
      anchor = { wall: nowMs, audio: ctx.currentTime }
    }
  }

  const sceneNow = (running: Running, nowMs: number): number =>
    (nowMs - running.originMs) / 1000

  const isEnded = (running: Running, nowMs: number): boolean =>
    running.ended || sceneNow(running, nowMs) >= running.scene.end

  const release = (running: Running, fadeS: number, nowMs: number): void => {
    const { bus, scene } = running

    if (fadeS > 0) {
      bus.fade(Math.max(audioAt(nowMs), ctx.currentTime), fadeS)
    }

    if (running.retire !== undefined) {
      timers.clear(running.retire)
    }

    running.ended = true
    running.retire = timers.set(
      () => {
        bus.dispose()
      },
      (Math.max(fadeS, scene.tail) + 1) * 1000,
    )
  }

  const retireWhenDone = (running: Running, nowMs: number): void => {
    if (running.retire !== undefined) {
      return
    }

    release(running, 0, nowMs)
  }

  // Fades a scene that is still talking; one that has said everything it will
  // say keeps its tail and is only scheduled for disposal.
  const settle = (running: Running, fadeS: number, nowMs: number): void => {
    if (isEnded(running, nowMs)) {
      retireWhenDone(running, nowMs)
    } else {
      release(running, fadeS, nowMs)
    }
  }

  const scheduleScene = (running: Running, nowMs: number, horizonS: number) => {
    const here = sceneNow(running, nowMs)
    const horizon = here + horizonS
    const from = Math.max(running.cursor, here - MAX_LATE_S)
    const to = Math.min(horizon, running.scene.end)

    if (to > from) {
      for (const event of running.scene.events(from, to)) {
        if (here - event.t > lateToleranceS(event.inst)) {
          continue
        }

        const when = Math.max(
          audioAt(running.originMs + event.t * 1000),
          ctx.currentTime,
        )

        play(running.bus, event, when)
      }
    }

    running.cursor = Math.max(
      running.cursor,
      Math.min(horizon, running.scene.end),
    )

    if (horizon >= running.scene.end) {
      retireWhenDone(running, nowMs)
    }
  }

  const fadeLane = (lane: Lane, fadeS: number, nowMs: number): void => {
    const running = lanes.get(lane)

    if (!running) {
      return
    }

    settle(running, fadeS, nowMs)
    lanes.delete(lane)
  }

  return {
    start: (scene, originMs) => {
      const nowMs = now()
      const existing = lanes.get(scene.lane)

      if (existing?.scene.key === scene.key && !isEnded(existing, nowMs)) {
        return false
      }

      track(nowMs)

      for (const cut of scene.cuts) {
        fadeLane(cut.lane, cut.fadeS, nowMs)
      }

      // A crossfade fades the scene it replaces; with none, its tail rings on.
      if (existing && lanes.get(scene.lane) === existing) {
        settle(existing, scene.crossfadeS, nowMs)
        lanes.delete(scene.lane)
      }

      const running: Running = {
        scene,
        bus: createLaneBus(graph, levelDb(scene.lane)),
        originMs,
        cursor: (nowMs - originMs) / 1000 - MAX_LATE_S,
        ended: false,
        retire: undefined,
      }

      lanes.set(scene.lane, running)

      return true
    },

    cue: (events) => {
      const nowMs = now()

      track(nowMs)
      cueBus ??= createLaneBus(graph, levelDb("cue"))

      for (const event of events) {
        const when = Math.max(
          audioAt(nowMs + event.t * 1000) + CUE_LEAD_S,
          ctx.currentTime + CUE_LEAD_S,
        )

        play(cueBus, event, when)
      }
    },

    pump: (horizonS = LOOKAHEAD_S) => {
      const nowMs = now()

      track(nowMs)

      for (const running of lanes.values()) {
        if (!running.ended) {
          scheduleScene(running, nowMs, horizonS)
        }
      }

      return [...lanes.values()].some((running) => !running.ended)
    },

    hasWork: () => [...lanes.values()].some((running) => !running.ended),

    stop: (lane, fadeS = 0.3) => {
      const nowMs = now()

      if (lane) {
        fadeLane(lane, fadeS, nowMs)

        return
      }

      for (const each of [...lanes.keys()]) {
        fadeLane(each, fadeS, nowMs)
      }

      if (cueBus) {
        cueBus.fade(Math.max(audioAt(nowMs), ctx.currentTime), fadeS)

        const old = cueBus

        cueBus = null
        timers.set(
          () => {
            old.dispose()
          },
          (fadeS + 4) * 1000,
        )
      }
    },

    live: () => {
      const nowMs = now()
      const result: Partial<Record<Lane, string>> = {}

      for (const [lane, running] of lanes) {
        if (!isEnded(running, nowMs)) {
          result[lane] = running.scene.key
        }
      }

      return result
    },

    dispose: () => {
      const nowMs = now()

      for (const each of [...lanes.keys()]) {
        fadeLane(each, 0, nowMs)
      }

      cueBus?.dispose()
      cueBus = null
    },
  }
}
