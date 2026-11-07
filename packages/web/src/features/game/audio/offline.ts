/**
 * Renders scenes into an OfflineAudioContext, through the same compile, engine
 * and voices the live score uses. This is how the loudness gate measures the
 * score without a speaker, and how a dev can render a whole round to a file.
 */
import { NO_TIME_LIMIT } from "@razzia/common/constants"
import { createEngine, PUMP_MS } from "@razzia/web/features/game/audio/engine"
import { createGraph } from "@razzia/web/features/game/audio/instruments"
import {
  type Cue,
  compileCue,
  compileScene,
  type Intensity,
  laneTrimDb,
  originMs,
  riseFor,
  type SceneSpec,
  type VerdictOutcome,
} from "@razzia/web/features/game/audio/scenes"

/** One call in a rendered timeline, `at` seconds after it begins. */
export type TimelineEntry =
  | { at: number; spec: SceneSpec; offsetMs?: number }
  | { at: number; cue: Cue }

export interface RenderOptions {
  /** Seconds of timeline to render. */
  duration: number
  intensity?: Intensity
  /** 1-based round and the quiz length, to hear the climb and the final layer. */
  round?: number
  total?: number
  sampleRate?: number
}

/** The prototype renders 10 ms in; the loudness windows were cut with that lead. */
const LEAD_S = 0.01

const NO_TIMERS = {
  set: (): unknown => undefined,
  clear: (): void => undefined,
}

// Looked up per call: jsdom has none, and tests stand one in.
const offlineContext = (): typeof OfflineAudioContext | undefined =>
  typeof OfflineAudioContext === "undefined" ? undefined : OfflineAudioContext

/** Renders a timeline of scene starts and cues to a stereo buffer. */
export const renderTimeline = async (
  entries: readonly TimelineEntry[],
  options: RenderOptions,
): Promise<AudioBuffer> => {
  const Offline = offlineContext()

  if (!Offline) {
    throw new Error("No OfflineAudioContext in this environment")
  }

  const rate = options.sampleRate ?? 44_100
  const intensity = options.intensity ?? "full"
  const { rise, final } = riseFor(options.round ?? 1, options.total ?? 0)
  const ctx = new Offline(2, Math.ceil((options.duration + 1) * rate), rate)
  const graph = createGraph(ctx)
  let virtualNow = -LEAD_S * 1000
  const engine = createEngine({
    ctx,
    graph,
    now: () => virtualNow,
    fixedClock: true,
    timers: NO_TIMERS,
    levelDb: (lane) => laneTrimDb(intensity, lane),
  })
  const compile = { intensity, surface: "host", rise, final } as const
  const pending = [...entries].sort((a, b) => a.at - b.at)
  const stepMs = PUMP_MS
  let next = 0

  // Run the live pump against a virtual clock: calls are made when they are
  // due and the engine looks 0.2 s ahead, exactly as in the browser. Nothing is
  // scheduled past what a live round would have, so a scene that is cut stops
  // where it was cut.
  // The engine's clock pair was taken 10 ms before zero, which gives the render
  // the prototype's 10 ms lead.
  for (
    virtualNow = 0;
    virtualNow <= options.duration * 1000;
    virtualNow += stepMs
  ) {
    while (next < pending.length && pending[next].at * 1000 <= virtualNow) {
      const entry = pending[next]

      next += 1

      if ("spec" in entry) {
        for (const part of compileScene(entry.spec, compile)) {
          engine.start(part, originMs(part.anchor, virtualNow, entry.offsetMs))
        }
      } else {
        engine.cue(compileCue(entry.cue, compile))
      }
    }

    engine.pump()
  }

  const rendered = await ctx.startRendering()

  engine.dispose()

  return rendered
}

/** Where the prototype's 90 s timeline puts each beat, for like-for-like measurement. */
export const PROTOTYPE_T = {
  lobby: 0,
  title: 9,
  lamps: 12,
  qnum: 15.5,
  read: 16.5,
  charge: 25,
  power: 28,
  open: 40,
  time: 54,
  board: 63,
  podium: 74,
  end: 90,
} as const

const JOIN_COUNT = 14

const VOTE_TIMES = [
  41.25, 42.25, 42.75, 43.5, 44, 44.5, 45.25, 45.75, 46.25, 47, 47.5, 48.25,
  49.25, 50.25, 51, 52, 53,
]

export interface ReferenceOptions {
  outcome?: VerdictOutcome
  votes?: readonly number[]
  answers?: number
  time?: number
}

/**
 * One whole round, started the way the screens would start it, at the
 * prototype's times: lobby, title, start lights, round card, reading and
 * charge, power-on, unlock, answering, TIME to strike, the board and the
 * podium. The loudness gate renders this and cuts it into the prototype's
 * measurement windows.
 */
export const referenceTimeline = (
  options: ReferenceOptions = {},
): TimelineEntry[] => {
  const T = PROTOTYPE_T
  const answers = options.answers ?? 4
  const time = options.time ?? T.time - T.open
  const reveal = (T.open - 12) * 1000
  const chargeAt = T.charge * 1000
  const resultsAt = T.time * 1000

  return [
    { at: T.lobby, spec: { scene: "lobby" } },
    ...Array.from({ length: JOIN_COUNT }, (_, index) => ({
      at: 0.9 + index * 0.56,
      cue: { cue: "join", index } as const,
    })),
    { at: T.title - 0.5, spec: { scene: "title" } },
    { at: T.lamps, spec: { scene: "lamps" } },
    { at: T.qnum - 0.25, spec: { scene: "roundCard" } },
    {
      at: T.read - 0.5,
      spec: {
        scene: "reading",
        chargeAt,
        chargeMs: (T.power - T.charge) * 1000,
        serverNow: (T.read - 0.5) * 1000,
      },
    },
    {
      at: T.power,
      spec: {
        scene: "answers",
        revealStartedAt: reveal,
        unlockAt: T.open * 1000,
        serverNow: reveal,
        answers,
        time: time === 0 ? NO_TIME_LIMIT : time,
      },
    },
    ...VOTE_TIMES.map((at, index) => ({
      at,
      cue: { cue: "pop", index } as const,
    })),
    {
      at: T.time,
      spec: {
        scene: "verdict",
        resultsAt,
        serverNow: resultsAt,
        votes: options.votes ?? [3, 8, 4, 2],
        outcome: options.outcome ?? "right",
      },
    },
    { at: T.board, spec: { scene: "leaderboard", rows: 5, overtakes: true } },
    { at: T.podium, spec: { scene: "podium", places: 3 } },
  ]
}
