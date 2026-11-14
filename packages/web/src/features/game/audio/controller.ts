/**
 * The score's public face: scene and cue calls in, sound out.
 *
 * It owns the things around the engine that Howler and the sound store decide:
 *
 * - The score plays through `Howler.ctx` and `Howler.masterGain`, so the
 *   existing mute, volume and deck-suppression logic keeps working untouched.
 *   Where Howler fell back to HTML5 audio there is no context and the score is a
 *   silent no-op.
 * - Howler suspends its context 30 s after the last Howl stops, and a
 *   synthesized score is not a Howl, so `autoSuspend` is switched off while
 *   anything is playing and put back after a quiet spell.
 * - Nothing is scheduled while the page is muted, suppressed or at zero volume,
 *   or when intensity is silent: the pump stops entirely. Scenes are still
 *   remembered, so unmuting mid-bed joins it mid-bar.
 * - The first tap or key press resumes the context, which WebKit requires
 *   before anything outside a gesture can wake it.
 * - The `classic` and `techno` packs play through the legacy adapter instead.
 *
 * Everything it touches arrives through `ControllerDeps`, so tests drive it
 * with fakes; `runtime.ts` supplies the real Howler, store and clock.
 */
import type { SoundTheme } from "@razzia/common/types/visuals"
import {
  createEngine,
  type Engine,
  type EngineDeps,
  PUMP_MS,
} from "@razzia/web/features/game/audio/engine"
import {
  createGraph,
  type Graph,
} from "@razzia/web/features/game/audio/instruments"
import {
  legacyCue,
  type LegacyPlan,
  legacyPlan,
  type LegacyRunner,
} from "@razzia/web/features/game/audio/legacy"
import type { Lane, Scene } from "@razzia/web/features/game/audio/music"
import {
  compileCue,
  compileScene,
  type Cue,
  type Intensity,
  laneTrimDb,
  originMs,
  anchorOf,
  POLL_CUES,
  riseFor,
  type SceneSpec,
  type Surface,
} from "@razzia/web/features/game/audio/scenes"

export interface ScoreConfig {
  intensity: Intensity
  theme: SoundTheme
  surface: Surface
}

export interface SceneOptions {
  /**
   * How long ago a scene without a server stamp logically began. Stamped scenes
   * work it out from their stamps and ignore this. Anything already in the past
   * is skipped, never replayed.
   */
  offsetMs?: number
  /**
   * Makes the call a complete no-op: it neither plays nor stops anything, so a
   * reviewed (replayed) screen cannot cut the live bed.
   */
  silent?: boolean
}

export interface Score {
  configure: (config: ScoreConfig) => void
  start: (spec: SceneSpec, options?: SceneOptions) => void
  stop: (lane?: Lane, fadeS?: number) => void
  cue: (cue: Cue, options?: SceneOptions) => void
  setRound: (round: number, total: number) => void
  dispose: () => void
  /** A snapshot for tests and the dev score board. */
  debug: () => ScoreDebug
}

export interface ScoreDebug {
  config: ScoreConfig
  pumping: boolean
  /** Whether Howler's auto-suspend is currently switched off by the score. */
  holdingAutoSuspend: boolean
  live: Partial<Record<Lane, string>>
  rise: number
  final: boolean
}

/** The slice of Howler the score uses. */
export interface HowlerLike {
  ctx: AudioContext | null
  masterGain: AudioNode | null
  autoSuspend: boolean
  /** Howler's own re-arm of the 30 s timer, if this build has it. */
  _autoSuspend?: () => unknown
}

export interface SoundState {
  muted: boolean
  suppressed: boolean
  volume: number
  /**
   * A poll covers the host's stage: the quiz's scenes and cues under it hold
   * (and pick back up when it goes), and only the poll's own cues play.
   */
  pollStage?: boolean
}

export interface ControllerDeps {
  howler: HowlerLike
  sound: {
    getState: () => SoundState
    subscribe: (listener: () => void) => () => void
  }
  legacy: LegacyRunner
  /** Where the page's taps and key presses arrive (the document). */
  gestures?: Pick<EventTarget, "addEventListener" | "removeEventListener">
  now: () => number
  timers: {
    setInterval: (fn: () => void, ms: number) => unknown
    clearInterval: (handle: unknown) => void
    setTimeout: (fn: () => void, ms: number) => unknown
    clearTimeout: (handle: unknown) => void
  }
  createEngine?: (deps: EngineDeps) => Engine
}

/** Howler's own auto-suspend fires after 30 s; ours waits a little less. */
export const RELEASE_AFTER_IDLE_MS = 20_000

/** A cue this late is not worth playing. */
const CUE_LATE_MS = 150

/** How long the quiz's sound takes to fade when a poll covers the stage. */
export const POLL_HOLD_FADE_S = 0.4

/** While the context is asleep, ask it to wake this often. */
const RESUME_EVERY_TICKS = 40

const GESTURES = ["pointerdown", "keydown", "touchend"] as const

export const DEFAULT_CONFIG: ScoreConfig = {
  intensity: "full",
  theme: "show",
  surface: "host",
}

/** What one `start` call became: its scenes (or legacy plan) and where it sits. */
interface Live {
  id: number
  key: string
  spec: SceneSpec
  originMs: number
  /** Seconds after the anchor at which it has nothing more to say. */
  end: number
  lanes: Lane[]
  cuts: Lane[]
  scenes: Scene[]
  plan: LegacyPlan | null
}

const sameConfig = (a: ScoreConfig, b: ScoreConfig): boolean =>
  a.intensity === b.intensity && a.theme === b.theme && a.surface === b.surface

export const createScore = (deps: ControllerDeps): Score => {
  const { howler, sound, legacy, timers } = deps
  const makeEngine = deps.createEngine ?? createEngine
  let config: ScoreConfig = { ...DEFAULT_CONFIG }
  let round = riseFor(0, 0)
  let seq = 0
  let engine: Engine | null = null
  let graph: Graph | null = null
  let pump: unknown = undefined
  let ticks = 0
  let held = false
  let disposed = false
  let previousAutoSuspend = true
  let releaseTimer: unknown = undefined
  let unsubscribe: (() => void) | null = null
  let wasSounding = false
  const live = new Map<Lane, Live>()

  // Whether the page may make any sound at all.
  const audible = (): boolean => {
    const state = sound.getState()

    return (
      config.intensity !== "silent" &&
      !state.muted &&
      !state.suppressed &&
      state.volume > 0
    )
  }

  // The quiz's own sound: held while a poll covers the stage.
  const soundOn = (): boolean =>
    audible() && sound.getState().pollStage !== true

  const webAudio = (): boolean =>
    // `@types/howler` says these are always set, but Howler leaves them null
    // when it fell back to HTML5 audio.
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    Boolean(howler.ctx && howler.masterGain && howler.ctx.state !== "closed")

  const engineOn = (on: () => boolean = soundOn): boolean =>
    config.theme === "show" && on() && webAudio()

  const cancelRelease = (): void => {
    if (releaseTimer !== undefined) {
      timers.clearTimeout(releaseTimer)
      releaseTimer = undefined
    }
  }

  const hold = (): void => {
    cancelRelease()

    if (!held) {
      previousAutoSuspend = howler.autoSuspend
      howler.autoSuspend = false
      held = true
    }
  }

  const release = (): void => {
    cancelRelease()

    if (!held) {
      return
    }

    held = false
    howler.autoSuspend = previousAutoSuspend

    if (typeof howler._autoSuspend === "function") {
      howler._autoSuspend()
    }
  }

  const releaseSoon = (): void => {
    if (held && releaseTimer === undefined) {
      releaseTimer = timers.setTimeout(() => {
        releaseTimer = undefined

        // A scene still being pumped needs the context awake; the pump asks
        // for the release itself once it has nothing left to say.
        if (pump !== undefined) {
          return
        }

        release()
      }, RELEASE_AFTER_IDLE_MS)
    }
  }

  const stopPump = (): void => {
    if (pump !== undefined) {
      timers.clearInterval(pump)
      pump = undefined
    }
  }

  const wake = (): void => {
    const { ctx } = howler

    if (ctx && ctx.state !== "running" && ctx.state !== "closed") {
      // A timer's resume is refused outside a gesture after an interruption;
      // the next tap must be able to do it.
      armUnlocking()
      ctx.resume().catch(() => undefined)
    }
  }

  // WebKit will not resume a context outside a tap or key press until it has
  // run once, and `wake` runs from timers. Howler has its own unlock, but only
  // once a Howl exists, and the `show` pack builds none. So the first gesture
  // resumes the context, and the listener goes once the context is running.
  const unlockOnGesture = (): void => {
    const { ctx } = howler

    if (!ctx || ctx.state === "closed") {
      return
    }

    if (ctx.state === "running") {
      stopUnlocking()

      return
    }

    ctx
      .resume()
      .then(() => {
        if (ctx.state === "running") {
          stopUnlocking()
        }
      })
      .catch(() => undefined)
  }

  const armUnlocking = (): void => {
    if (disposed) {
      return
    }

    for (const type of GESTURES) {
      deps.gestures?.addEventListener(type, unlockOnGesture, true)
    }
  }

  const stopUnlocking = (): void => {
    for (const type of GESTURES) {
      deps.gestures?.removeEventListener(type, unlockOnGesture, true)
    }
  }

  const tick = (): void => {
    const { ctx } = howler

    if (!engine || !engineOn() || !ctx) {
      stopPump()

      return
    }

    if (ctx.state !== "running") {
      ticks += 1

      if (ticks % RESUME_EVERY_TICKS === 0) {
        wake()
      }

      return
    }

    if (!engine.pump()) {
      stopPump()
      releaseSoon()
    }
  }

  const ensurePump = (): void => {
    if (pump === undefined) {
      ticks = 0
      pump = timers.setInterval(tick, PUMP_MS)
    }
  }

  const teardownEngine = (): void => {
    engine?.dispose()
    graph?.master.disconnect()
    engine = null
    graph = null
  }

  // Howler can replace its context (it does on some phones to fix the sample
  // rate), which orphans the graph; build a new one against the live context.
  const ensureEngine = (): Engine | null => {
    const { ctx, masterGain } = howler

    if (!ctx || !masterGain || ctx.state === "closed") {
      return null
    }

    if (engine && graph?.ctx !== ctx) {
      teardownEngine()
      // The new context starts out asleep on some phones.
      armUnlocking()
    }

    if (!engine) {
      graph = createGraph(ctx, masterGain)
      engine = makeEngine({
        ctx,
        graph,
        now: deps.now,
        levelDb: (lane) => laneTrimDb(config.intensity, lane),
      })
    }

    return engine
  }

  const opts = () => ({
    intensity: config.intensity,
    surface: config.surface,
    rise: round.rise,
    final: round.final,
  })

  const isEnded = (item: Live): boolean =>
    (deps.now() - item.originMs) / 1000 >= item.end

  const play = (item: Live): void => {
    if (config.theme === "show") {
      const running = engineOn() ? ensureEngine() : null

      if (!running) {
        return
      }

      hold()
      wake()

      for (const scene of item.scenes) {
        running.start(scene, item.originMs)
      }

      ensurePump()

      // A sleeping context has a frozen clock; the pump waits for it to wake.
      if (howler.ctx?.state === "running") {
        running.pump()
      }

      return
    }

    if (item.plan && soundOn()) {
      legacy.start(item.plan, item.originMs, config.intensity)
    }
  }

  const compile = (
    spec: SceneSpec,
    receivedAt: number,
    offsetMs: number,
  ): Live | null => {
    const anchor = anchorOf(spec) ?? null

    if (config.theme === "show") {
      const scenes = compileScene(spec, opts())

      if (scenes.length === 0) {
        return null
      }

      return {
        id: 0,
        key: scenes.map((scene) => scene.key).join("+"),
        spec,
        originMs: originMs(scenes[0].anchor, receivedAt, offsetMs),
        end: Math.max(...scenes.map((scene) => scene.end)),
        lanes: scenes.map((scene) => scene.lane),
        cuts: scenes.flatMap((scene) => scene.cuts.map((cut) => cut.lane)),
        scenes,
        plan: null,
      }
    }

    const plan = legacyPlan(spec, anchor, opts())

    if (!plan) {
      return null
    }

    return {
      id: 0,
      key: plan.key,
      spec,
      originMs: originMs(plan.anchor, receivedAt, offsetMs),
      // A loop with no `until` (an untimed question's music) never ends by
      // itself, so a mute, a setting change or a repeated start must keep it.
      end: Math.max(
        0,
        ...plan.events.map((event) =>
          event.sfx === "music" && event.until === undefined
            ? Infinity
            : (event.until ?? event.t),
        ),
      ),
      lanes: [plan.lane],
      cuts: [...plan.cuts],
      scenes: [],
      plan,
    }
  }

  const unique = (): Live[] => [...new Set(live.values())]

  const quiet = (): void => {
    stopPump()
    legacy.unloadAll()
  }

  // The sound state changed: go quiet, or pick the live scenes back up.
  const onSoundChange = (): void => {
    const sounding = soundOn()

    if (sounding === wasSounding) {
      return
    }

    wasSounding = sounding

    if (!sounding) {
      // A mute silences what is already ringing; a poll covering the stage
      // does not, so the quiz's sound fades out under it instead.
      if (audible()) {
        engine?.stop(undefined, POLL_HOLD_FADE_S)
      }

      quiet()
      // Nothing pumps now, and nothing else would let the context sleep.
      release()

      return
    }

    for (const item of unique()) {
      if (!isEnded(item)) {
        play(item)
      }
    }
  }

  const subscribe = (): void => {
    if (!unsubscribe) {
      wasSounding = soundOn()
      unsubscribe = sound.subscribe(onSoundChange)
    }
  }

  const stopEverything = (fadeS: number): void => {
    engine?.stop(undefined, fadeS)
    legacy.unloadAll()
    stopPump()
  }

  const reapply = (): void => {
    const items = unique()

    stopEverything(0.1)
    live.clear()
    legacy.setTheme(config.theme === "show" ? "classic" : config.theme)

    for (const old of items) {
      const next = compile(old.spec, old.originMs, 0)

      if (!next) {
        continue
      }

      // Re-place the scene on the same anchor rather than "now".
      const item = { ...next, id: old.id, originMs: old.originMs }

      for (const lane of item.lanes) {
        live.set(lane, item)
      }

      if (!isEnded(item)) {
        play(item)
      }
    }
  }

  armUnlocking()

  return {
    configure: (next) => {
      subscribe()

      if (sameConfig(config, next)) {
        return
      }

      config = { ...next }
      wasSounding = soundOn()
      reapply()
    },

    start: (spec, options = {}) => {
      if (options.silent) {
        return
      }

      subscribe()

      const item = compile(spec, deps.now(), options.offsetMs ?? 0)

      if (!item) {
        return
      }

      // The same scene, still live, is not started twice.
      const current = live.get(item.lanes[0])

      if (current?.key === item.key && !isEnded(current)) {
        return
      }

      seq += 1

      const placed = { ...item, id: seq }

      for (const lane of placed.cuts) {
        live.delete(lane)
      }

      for (const lane of placed.lanes) {
        live.set(lane, placed)
      }

      if (config.theme !== "show") {
        legacy.setTheme(config.theme)
      }

      play(placed)
    },

    cue: (cue, options = {}) => {
      if (options.silent || (options.offsetMs ?? 0) > CUE_LATE_MS) {
        return
      }

      subscribe()

      // A poll's own cue plays over the held quiz; every other cue waits with it.
      const on = POLL_CUES.has(cue.cue) ? audible : soundOn

      if (!on()) {
        return
      }

      if (config.theme !== "show") {
        const event = legacyCue(cue, opts())

        if (event) {
          legacy.setTheme(config.theme)
          legacy.cue(event, config.intensity)
        }

        return
      }

      const running = engineOn(on) ? ensureEngine() : null
      const events = compileCue(cue, opts())

      if (!running || events.length === 0) {
        return
      }

      // A cue into a sleeping context would play late, after it wakes; drop it
      // and ask the context to wake for the next one.
      if (howler.ctx?.state !== "running") {
        wake()

        return
      }

      hold()
      running.cue(events)
      releaseSoon()
    },

    stop: (lane, fadeS = 0.3) => {
      legacy.stop(lane)
      engine?.stop(lane, fadeS)

      if (lane) {
        live.delete(lane)

        return
      }

      live.clear()
      stopPump()
      release()
    },

    setRound: (current, total) => {
      round = riseFor(current, total)
    },

    dispose: () => {
      disposed = true
      stopEverything(0)
      live.clear()
      teardownEngine()
      stopUnlocking()
      unsubscribe?.()
      unsubscribe = null
      release()
    },

    debug: () => {
      const lanes: Partial<Record<Lane, string>> = {}

      for (const [lane, item] of live) {
        lanes[lane] = item.key
      }

      return {
        config,
        pumping: pump !== undefined,
        holdingAutoSuspend: held,
        live: lanes,
        rise: round.rise,
        final: round.final,
      }
    },
  }
}
