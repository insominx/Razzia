/**
 * Scenes: the score as data.
 *
 * A scene turns what a screen already knows (server stamps, the number of
 * answers, the votes) into a list of voices at times measured from the scene's
 * anchor. Everything here is pure: no AudioContext, no clock, no Howler. The
 * engine decides when "now" is; this file only says what happens `t` seconds
 * after the anchor.
 *
 * One clock: 120 BPM, so one second is two beats and a sixteenth is 0.125 s.
 * The server's answer reveal (slots at +1, +4, +7 and +10 s, unlock at +12 s
 * for four answers) already lands on that grid, which is why the groove can be
 * anchored to the unlock stamp and still hit the beat.
 */
import { NO_TIME_LIMIT } from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import type { ShowIntensity } from "@razzia/common/types/visuals"
import {
  ANSWER_REVEAL_INITIAL_DELAY_MS,
  ANSWER_REVEAL_SLOT_INTERVAL_MS,
  getAnswerRevealDuration,
} from "@razzia/common/utils/answer-reveal"
import { getQuestionPromptRevealMs } from "@razzia/common/utils/question-transition"
import {
  RESULT_COUNT_MS,
  RESULT_RAIL_STAGGER_MS,
  RESULT_SPOTLIGHT_MS,
  RESULT_STRIKE_MS,
  RESULT_TIME_MS,
} from "@razzia/common/utils/result-reveal"
import {
  S16,
  type SceneEvent,
  seed,
} from "@razzia/web/features/game/audio/instruments"
import {
  type Anchor,
  CHORDS,
  type Ctx,
  ev,
  fixed,
  floorDiv,
  isCalmDrop,
  LAMP_NOTES,
  LIFT,
  makeScene,
  mix,
  mod,
  type Lane,
  PENT,
  POWER_NOTES,
  progress,
  type Scene,
  type Source,
  stepped,
  TICK_SCALE,
  tr,
  trAll,
} from "@razzia/web/features/game/audio/music"

export type { Anchor, Lane, Scene }

/** The "Show intensity" setting; the same three values the server stores. */
export type Intensity = ShowIntensity

export type Surface = "host" | "player"

/**
 * Seconds after `resultsAt` at which each beat of the verdict lands: TIME, the
 * count (rails grow, ticks climb), the spotlight (heartbeat and low swell) and
 * the strike (chord and hit). The screens' visuals follow the same numbers.
 */
export const VERDICT_T = {
  time: RESULT_TIME_MS / 1_000,
  count: RESULT_COUNT_MS / 1_000,
  spotlight: RESULT_SPOTLIGHT_MS / 1_000,
  strike: RESULT_STRIKE_MS / 1_000,
} as const

/** The count's tiles start this far apart, smallest first, and each ticks for this long. */
export const COUNT_STAGGER_S = RESULT_RAIL_STAGGER_MS / 1_000

export const COUNT_SPAN_S = 0.5

/** The leaderboard groove kicks in, and the first overtake lands, this long after the scene starts. */
export const BOARD_REORDER_S = 3

/**
 * Seconds after the podium scene starts for third, second, the roll and first
 * place with all three places filled. Each empty place shifts the rest earlier
 * by `PODIUM_GAP_S`, so one or two players do not wait through silence.
 */
export const PODIUM_T = { third: 1, second: 3.5, roll: 5, first: 9 } as const

export const PODIUM_GAP_S = 2.5

/** Seconds after the lamps scene starts: three clunks, then GO. */
export const LAMPS_T = { first: 0, step: 1, go: 3 } as const

/** Ticks of the last countdown. */
export const LAST_SECONDS = 5

/**
 * The whole score rises one semitone per round, up to this many. Past it the
 * pitch holds, so a long quiz climbs for its first few rounds and then stays at
 * a bright but not shrill height; the final question's extra layer is the last
 * lift. The tick scale tops out near MIDI 93, so five semitones keep its
 * brightest partial under 10 kHz.
 */
export const RISE_CAP = 5

/** Calm plays the music this much quieter. */
export const CALM_MUSIC_DB = -12

/**
 * The trim for a lane's bus. Only the music (`bed`) is turned down in calm;
 * the hits are removed instead, and a tick or a join still has to be heard.
 */
export const laneTrimDb = (
  intensity: Intensity,
  lane: "bed" | "show" | "verdict" | "cue",
): number => (intensity === "calm" && lane === "bed" ? CALM_MUSIC_DB : 0)

export const riseFor = (
  round: number,
  total: number,
): { rise: number; final: boolean } => ({
  rise: Math.min(RISE_CAP, Math.max(0, Math.floor(round) - 1)),
  final: total > 0 && round >= total,
})

export type SceneSpec =
  | { scene: "lobby" }
  | { scene: "title" }
  | { scene: "lamps" }
  | { scene: "roundCard" }
  | {
      scene: "reading"
      /** When the line starts charging: after the prompt, before the answers. */
      chargeAt: number
      chargeMs: number
      serverNow: number
    }
  | {
      scene: "answers"
      revealStartedAt: number
      /** The moment answers open: the drop lands here. */
      unlockAt: number
      serverNow: number
      /** How many answers (2 to 4). */
      answers: number
      /** Seconds to answer, or `NO_TIME_LIMIT`. */
      time: number
    }
  | { scene: "time"; resultsAt: number; serverNow: number }
  | {
      scene: "count"
      resultsAt: number
      serverNow: number
      /** Votes per answer, in answer order. */
      votes: readonly number[]
    }
  | { scene: "spotlight"; resultsAt: number; serverNow: number }
  | {
      scene: "strike"
      resultsAt: number
      serverNow: number
      outcome: VerdictOutcome
    }
  | {
      /** TIME, count, spotlight and strike in one call. */
      scene: "verdict"
      resultsAt: number
      serverNow: number
      votes: readonly number[]
      outcome: VerdictOutcome
    }
  | {
      scene: "leaderboard"
      /** Bars on the board (at most 5). */
      rows?: number
      /** Whether anyone changes place; the overtake flourish only plays if so. */
      overtakes?: boolean
    }
  | {
      scene: "podium"
      /** Medal places filled (1 to 3). */
      places?: number
    }

/**
 * How the room did. `right`: the crowd got it, so the light stays and the chord
 * is major. `wrong`: the crowd fell for another answer, so the light jumps and
 * the chord is minor. `none`: nobody answered.
 */
export type VerdictOutcome = "right" | "wrong" | "none"

export type SceneName = SceneSpec["scene"]

export type Cue =
  | { cue: "join"; index: number }
  | { cue: "pop"; index: number }
  | { cue: "tick"; index: number }
  | { cue: "lamp"; k: number }
  | { cue: "go" }
  | { cue: "whoosh" }
  | { cue: "impact" }
  | { cue: "place"; place: 1 | 2 | 3 }
  | { cue: "roll"; ms: number }

export interface CompileOptions {
  intensity: Intensity
  surface: Surface
  rise: number
  final: boolean
}

/** Beats only the projector plays; a phone keeps the personal ones. */
const HOST_ONLY: ReadonlySet<SceneName> = new Set([
  "lobby",
  "title",
  "lamps",
  "count",
  "spotlight",
  "leaderboard",
  "podium",
])

const HOST_ONLY_CUES: ReadonlySet<Cue["cue"]> = new Set([
  "join",
  "place",
  "roll",
])

/** The stamp a scene is anchored to, with the clock it arrived with. */
export const anchorOf = (spec: SceneSpec): Anchor | undefined => {
  if (spec.scene === "reading") {
    return { stamp: spec.chargeAt, serverNow: spec.serverNow }
  }

  if (spec.scene === "answers") {
    return { stamp: spec.unlockAt, serverNow: spec.serverNow }
  }

  // Every verdict beat is stamped with `resultsAt`.
  if ("resultsAt" in spec) {
    return { stamp: spec.resultsAt, serverNow: spec.serverNow }
  }

  return undefined
}

/**
 * Local epoch milliseconds at which a scene's anchor is (or was) due.
 *
 * Stamped scenes use the server clock that came with the stamp, so the two
 * machines' clocks never meet: `serverNow - stamp` is how long ago the beat was
 * due when the message was sent. Unstamped scenes began `offsetMs` ago.
 */
export const originMs = (
  anchor: Anchor | null,
  receivedAt: number,
  offsetMs = 0,
): number =>
  anchor
    ? receivedAt + (anchor.stamp - anchor.serverNow)
    : receivedAt - offsetMs

/**
 * The stamp the drop should land on. Answers normally open at `unlockAt`, but a
 * manager can skip the wait; the payload that opens them then carries a
 * `serverNow` before `unlockAt`, and that is the moment the room hears.
 */
export const unlockStamp = (data: {
  unlockAt: number
  serverNow: number
  answeringOpen: boolean
}): number =>
  data.answeringOpen ? Math.min(data.unlockAt, data.serverNow) : data.unlockAt

/**
 * The `reading` scene for a SHOW_QUESTION payload: near silence while the
 * prompt appears, then the charge for the question's own cooldown.
 */
export const readingSpec = (
  data: Pick<
    CommonStatusDataMap["SHOW_QUESTION"],
    "promptStartedAt" | "question" | "cooldown" | "serverNow"
  >,
): SceneSpec => ({
  scene: "reading",
  chargeAt: data.promptStartedAt + getQuestionPromptRevealMs(data.question),
  chargeMs: data.cooldown * 1000,
  serverNow: data.serverNow,
})

/**
 * The `answers` scene for a SELECT_ANSWER payload, whether answers are still
 * powering on or already open: the same call both times is a no-op, so a screen
 * can call it on every data change.
 */
export const answersSpec = (
  data: Pick<
    CommonStatusDataMap["SELECT_ANSWER"],
    | "revealStartedAt"
    | "unlockAt"
    | "serverNow"
    | "answeringOpen"
    | "answers"
    | "time"
  >,
): SceneSpec => ({
  scene: "answers",
  revealStartedAt: data.revealStartedAt,
  unlockAt: unlockStamp(data),
  serverNow: data.serverNow,
  answers: data.answers.length,
  time: data.time,
})

/**
 * Votes per answer, in answer order, and how the room did. The crowd was right
 * when any of the most-picked answers is a solution (the light stays), wrong
 * when none is (the light jumps), and `none` when nobody answered.
 */
export const verdictOf = (
  responses: Readonly<Record<number, number>>,
  solutions: readonly number[],
  answerCount: number,
): { votes: number[]; outcome: VerdictOutcome } => {
  const votes = Array.from(
    { length: answerCount },
    (_, answer) => responses[answer] ?? 0,
  )
  const top = Math.max(0, ...votes)

  if (top === 0) {
    return { votes, outcome: "none" }
  }

  const rightCrowd = votes.some(
    (count, answer) => count === top && solutions.includes(answer),
  )

  return { votes, outcome: rightCrowd ? "right" : "wrong" }
}

/** The whole verdict (TIME, count, spotlight, strike) for a results payload. */
export const verdictSpec = (data: {
  resultsAt: number
  serverNow: number
  responses: Readonly<Record<number, number>>
  solutions: readonly number[]
  answerCount: number
}): SceneSpec => ({
  scene: "verdict",
  resultsAt: data.resultsAt,
  serverNow: data.serverNow,
  ...verdictOf(data.responses, data.solutions, data.answerCount),
})

const LOBBY_CUTOFF_RAMP_S = 9

const lobby = (c: Ctx): Scene[] => [
  makeScene(
    c,
    {
      name: "lobby",
      lane: "bed",
      key: "lobby",
      end: Infinity,
      crossfadeS: 0.25,
    },
    [
      stepped((i) => {
        const s = mod(i, 16)
        const t = i * S16
        const chord = CHORDS[mod(floorDiv(i, 16), 4)]
        const events: SceneEvent[] = []

        if (s === 0) {
          events.push(
            ev(t, "pad", {
              notes: trAll(c, chord.slice(1)),
              dur: 2,
              v: 0.075,
              cut: 620 + Math.min(t, LOBBY_CUTOFF_RAMP_S) * 40,
            }),
          )
        }

        if (s === 0 || s === 6 || s === 10) {
          events.push(
            ev(t, "pluck", {
              m: tr(c, PENT[Math.floor(seed(i * 0.31) * 6)]),
              v: 0.28,
              rev: 0.45,
              dly: 0.4,
              bus: "dry",
            }),
          )
        }

        return events
      }),
    ],
  ),
]

const title = (c: Ctx): Scene[] => [
  makeScene(
    c,
    {
      name: "title",
      lane: "show",
      key: "title",
      end: 2,
      // The lobby stops where it is and rings out under the impact, as in the
      // prototype; a fade would cut the pad that carries the title's mids.
      cuts: [{ lane: "bed", fadeS: 0 }],
    },
    [
      fixed([
        ev(0, "riser", { dur: 0.5, v: 0.2, lo: 800, hi: 6000 }),
        ev(0.5, "impact", { v: 0.8, rev: 0.55 }),
        ev(0.625, "whoosh", { dur: 1.3, v: 0.16 }),
        ev(1.5, "pad", {
          notes: trAll(c, CHORDS[1].slice(1)),
          dur: 2,
          v: 0.1,
          cut: 1500,
        }),
      ]),
    ],
  ),
]

const lamps = (c: Ctx): Scene[] => [
  makeScene(c, { name: "lamps", lane: "show", key: "lamps", end: 3.5 }, [
    fixed([
      ...LAMP_NOTES.map((m, k) =>
        ev(LAMPS_T.first + k * LAMPS_T.step, "clunk", { m: tr(c, m), v: 1 }),
      ),
      ev(LAMPS_T.go, "impact", { v: 1, rev: 0.4 }),
      ev(LAMPS_T.go, "stab", {
        notes: trAll(c, [57, 60, 64, 69]),
        dur: 0.5,
        v: 0.9,
        cut: 4200,
        rev: 0.4,
        dly: 0.2,
      }),
    ]),
  ]),
]

const roundCard = (c: Ctx): Scene[] => [
  makeScene(c, { name: "roundCard", lane: "show", key: "roundCard", end: 1 }, [
    fixed([
      ev(0, "whoosh", { dur: 0.55, v: 0.2 }),
      ev(0.5, "pluck", {
        m: tr(c, 69),
        v: 0.5,
        rev: 0.5,
        dly: 0.3,
        bus: "dry",
      }),
      ...(c.final
        ? [
            ev(0.625, "pluck", {
              m: tr(c, 76),
              v: 0.4,
              rev: 0.5,
              dly: 0.4,
              bus: "dry",
            }),
          ]
        : []),
    ]),
  ]),
]

/**
 * The pad's swell runs from the start of the charge to the unlock. The charge
 * takes the first fifth of it, as in the prototype (3 s of 15).
 */
const PAD_SPLIT = 0.2

const readingScene = (
  c: Ctx,
  spec: Extract<SceneSpec, { scene: "reading" }>,
): Scene[] => {
  const chargeS = Math.max(0.5, spec.chargeMs / 1000)

  return [
    makeScene(
      c,
      {
        name: "reading",
        lane: "bed",
        key: `reading|${spec.chargeAt}|${spec.chargeMs}`,
        anchor: anchorOf(spec),
        end: chargeS,
        crossfadeS: 0.25,
      },
      [
        stepped((i) => {
          const t = i * S16

          if (mod(i, 16) !== 0) {
            return []
          }

          const notes = trAll(c, CHORDS[mod(floorDiv(i, 16), 4)].slice(1))

          if (t < 0) {
            return [ev(t, "pad", { notes, dur: 2, v: 0.06, cut: 620 })]
          }

          const p = PAD_SPLIT * progress(t, 0, chargeS)

          return [
            ev(t, "pad", {
              notes,
              dur: 2,
              v: mix(0.06, 0.11, p),
              cut: mix(600, 1500, p),
            }),
          ]
        }, chargeS),
        fixed([ev(0, "riser", { dur: chargeS, v: 0.05, lo: 300, hi: 1600 })]),
      ],
    ),
  ]
}

const answersScene = (
  c: Ctx,
  spec: Extract<SceneSpec, { scene: "answers" }>,
): Scene[] => {
  const count = Math.max(1, Math.floor(spec.answers))
  const revealS = getAnswerRevealDuration(count) / 1000
  const slot = (k: number): number =>
    -revealS +
    (ANSWER_REVEAL_INITIAL_DELAY_MS + k * ANSWER_REVEAL_SLOT_INTERVAL_MS) / 1000
  const timed = spec.time !== NO_TIME_LIMIT && spec.time > 0
  const timeS = timed ? spec.time : Infinity
  const last5At = timed ? Math.max(0, timeS - LAST_SECONDS) : Infinity
  // A layer is on once its answer has powered on, and every layer is on at
  // the unlock, however few answers there are.
  const layerOn = (k: number, t: number): boolean =>
    t >= 0 || (k < count && t >= slot(k))
  const grooveUntil = c.calm ? 0 : timeS

  const groove = (i: number): SceneEvent[] => {
    const t = i * S16

    if (t < slot(0)) {
      return []
    }

    const s = mod(i, 16)
    const chord = CHORDS[mod(floorDiv(i, 16), 4)]
    const open = t >= 0
    const last5 = t >= last5At
    const squeeze = last5 ? progress(t, last5At, timeS) : 0
    const events: SceneEvent[] = []

    if (s % 4 === 2) {
      events.push(ev(t, "hat", { v: open ? 0.55 : 0.18, d: 0.04 }))
    }

    if (last5 && s % 2 === 1) {
      events.push(ev(t, "hat", { v: 0.3 + 0.3 * squeeze, d: 0.018 }))
    }

    if (open && !last5 && s % 4 === 0) {
      events.push(ev(t, "hat", { v: 0.22, d: 0.018 }))
    }

    if (layerOn(1, t) && s % 4 !== 0 && s % 8 !== 6) {
      const closed = mix(320, 620, progress(t, slot(1), 0))
      const cut = last5 ? mix(1100, 2100, squeeze) : 900

      events.push(
        ev(t, "bass", {
          m: tr(c, chord[0]),
          dur: 0.11,
          cut: open ? cut : closed,
          v: open ? 1 : 0.17,
        }),
      )
    }

    if (layerOn(2, t) && s % 2 === 0) {
      const line = [
        chord[1],
        chord[2],
        chord[3],
        chord[2] + 12,
        chord[3] + 12,
        chord[2] + 12,
        chord[3],
        chord[2],
      ]

      events.push(
        ev(t, "pluck", {
          m: tr(c, line[(s / 2) % 8] + 12),
          v: open ? 0.26 : 0.08,
          rev: 0.22,
          dly: 0.34,
        }),
      )
    }

    if (layerOn(3, t) && s % 4 === 0) {
      events.push(ev(t, "kick", { v: open ? 1 : 0.16, lp: open ? 0 : 380 }))
    }

    if (open && (s === 4 || s === 12)) {
      events.push(ev(t, "clap", { v: 0.62 }))
    }

    if (open && (s === 3 || s === 6 || s === 11)) {
      events.push(
        ev(t, "stab", {
          notes: trAll(c, chord.slice(1)),
          dur: 0.14,
          v: 0.62,
          cut: last5 ? 4200 : 2600,
          rev: 0.22,
          dly: 0.26,
        }),
      )
    }

    // The last question adds a bright line above the groove.
    if (c.final && open && (s === 0 || s === 6 || s === 10)) {
      const lead = [chord[2] + 12, chord[3] + 12, chord[1] + 24][
        [0, 6, 10].indexOf(s)
      ]

      events.push(
        ev(t, "pluck", {
          m: tr(c, lead),
          v: 0.3,
          rev: 0.3,
          dly: 0.5,
          bus: "dry",
        }),
      )
    }

    return events
  }

  const powerPad = (i: number): SceneEvent[] => {
    const t = i * S16

    if (mod(i, 16) !== 0 || t >= 0 || t < -revealS) {
      return []
    }

    const p = PAD_SPLIT + (1 - PAD_SPLIT) * progress(t, -revealS, 0)

    return [
      ev(t, "pad", {
        notes: trAll(c, CHORDS[mod(floorDiv(i, 16), 4)].slice(1)),
        dur: 2,
        v: mix(0.06, 0.11, p),
        cut: mix(600, 1500, p),
      }),
    ]
  }

  const slots = Array.from({ length: Math.min(count, 4) }, (_, k) =>
    ev(slot(k), "clunk", { m: tr(c, POWER_NOTES[k]), v: 0.22 }),
  )
  const lastFive = timed && timeS > LAST_SECONDS
  const ticks = lastFive
    ? TICK_SCALE.map((m, k) =>
        ev(timeS - LAST_SECONDS + k, "tick", { m: tr(c, m), v: 0.95 }),
      )
    : []

  return [
    makeScene(
      c,
      {
        name: "answers",
        lane: "bed",
        key: `answers|${spec.revealStartedAt}|${spec.unlockAt}|${count}|${spec.time}`,
        anchor: anchorOf(spec),
        end: timeS,
        crossfadeS: 0.25,
      },
      [
        stepped(powerPad, 0),
        stepped(groove, grooveUntil),
        fixed([
          ...slots,
          ev(-2, "riser", { dur: 2, v: 0.09, lo: 500, hi: 8000 }),
          ev(0, "impact", { v: 0.46, rev: 0.6 }),
          ev(0, "crash", { v: 0.18, d: 2.2 }),
          ev(0, "chord", {
            notes: trAll(c, CHORDS[0].slice(1)),
            v: 0.28,
            dur: 0.5,
          }),
          ...(lastFive
            ? [
                ev(timeS - LAST_SECONDS, "riser", {
                  dur: 5,
                  v: 0.3,
                  lo: 600,
                  hi: 10000,
                }),
              ]
            : []),
          ...ticks,
        ]),
      ],
    ),
  ]
}

const VERDICT_CUT = [{ lane: "bed", fadeS: 0.04 }] as const

const verdictAnchor = (spec: {
  resultsAt: number
  serverNow: number
}): Anchor => ({ stamp: spec.resultsAt, serverNow: spec.serverNow })

const timeEvents = (c: Ctx) =>
  c.calm
    ? [
        ev(VERDICT_T.time, "pluck", {
          m: tr(c, 69),
          v: 0.5,
          rev: 0.4,
          dly: 0.2,
          bus: "dry",
        }),
      ]
    : [ev(VERDICT_T.time, "impact", { v: 1.1, rev: 0.3 })]

const countEvents = (c: Ctx, votes: readonly number[]) => {
  const order = votes
    .map((count, tile) => ({ count, tile }))
    .sort((a, b) => a.count - b.count || a.tile - b.tile)
  const events: SceneEvent[] = []

  for (const [rank, { count }] of order.entries()) {
    const start = VERDICT_T.count + rank * COUNT_STAGGER_S
    const steps = Math.min(8, 3 + Math.round(count / 2))

    for (let k = 0; k < steps; k += 1) {
      const snapped =
        Math.round((start + (k * COUNT_SPAN_S) / steps) / S16) * S16
      // Snapped to the grid, but never ahead of the count's own start.
      const at = Math.max(VERDICT_T.count, snapped)

      events.push(ev(at, "tick", { m: tr(c, 69 + rank * 3 + k * 2), v: 0.4 }))
    }
  }

  return events
}

const spotlightEvents = (c: Ctx) => {
  const at = VERDICT_T.spotlight

  return [
    ev(at, "swell", {
      notes: trAll(c, [33, 45, 46]),
      dur: 0.95,
      v: 0.14,
      cut: 520,
    }),
    ev(at + 0.4, "kick", { v: 0.5 }),
    ev(at + 0.7, "kick", { v: 0.7 }),
  ]
}

const STRIKE_CHORD = {
  right: [48, 60, 64, 67, 72],
  wrong: [45, 57, 60, 64, 69],
  none: [48, 55, 60, 67, 72],
} as const

const STRIKE_TAIL = {
  right: [48, 55, 60, 64],
  wrong: [45, 52, 57, 60],
  none: [48, 55, 60, 67],
} as const

/** Seconds the strike's pad tail lasts: the room can talk over it by then. */
const STRIKE_TAIL_S = 5.6

const strikeEvents = (c: Ctx, outcome: VerdictOutcome) => {
  const at = VERDICT_T.strike
  const notes = trAll(c, STRIKE_CHORD[outcome])
  const events: SceneEvent[] = []

  if (c.calm) {
    events.push(
      ev(at, "chord", { notes, v: outcome === "none" ? 0.2 : 0.3, dur: 2.4 }),
    )
  } else if (outcome === "right") {
    events.push(
      ev(at, "impact", { v: 1.1, rev: 0.65 }),
      ev(at, "chord", { notes, v: 1, dur: 2.8 }),
      ev(at, "crash", { v: 0.34, d: 3.2 }),
    )
  } else if (outcome === "wrong") {
    events.push(
      ev(at, "impact", { v: 1.1, rev: 0.65 }),
      ev(at, "chord", { notes, v: 1.15, dur: 2.8 }),
      ev(at, "crash", { v: 0.3, d: 2.8 }),
    )
  } else {
    events.push(
      ev(at, "impact", { v: 0.6, rev: 0.5 }),
      ev(at, "chord", { notes, v: 0.6, dur: 2.4 }),
    )
  }

  events.push(ev(at + 1.25, "whoosh", { dur: 0.3, v: 0.14 }))

  for (const offset of [1, 3, 5]) {
    events.push(
      ev(at + offset, "pad", {
        notes: trAll(c, STRIKE_TAIL[outcome]),
        dur: 2,
        v: 0.1 * (1 - progress(offset, 0, STRIKE_TAIL_S)),
        cut: 1600,
      }),
    )
  }

  return events
}

const verdictScene = (
  c: Ctx,
  spec: { resultsAt: number; serverNow: number },
  def: { name: string; key: string; end: number; events: Source },
): Scene => {
  const { events, ...rest } = def

  return makeScene(
    c,
    {
      ...rest,
      lane: "verdict",
      anchor: verdictAnchor(spec),
      cuts: def.name === "time" || def.name === "verdict" ? VERDICT_CUT : [],
    },
    [events],
  )
}

const VERDICT_END = VERDICT_T.strike + 2

const timeScene = (
  c: Ctx,
  spec: Extract<SceneSpec, { scene: "time" }>,
): Scene[] => [
  verdictScene(c, spec, {
    name: "time",
    key: `time|${spec.resultsAt}`,
    end: 0.5,
    events: fixed(timeEvents(c)),
  }),
]

const countScene = (
  c: Ctx,
  spec: Extract<SceneSpec, { scene: "count" }>,
): Scene[] => [
  verdictScene(c, spec, {
    name: "count",
    key: `count|${spec.resultsAt}`,
    end: VERDICT_T.spotlight,
    events: fixed(countEvents(c, spec.votes)),
  }),
]

const spotlightScene = (
  c: Ctx,
  spec: Extract<SceneSpec, { scene: "spotlight" }>,
): Scene[] => [
  verdictScene(c, spec, {
    name: "spotlight",
    key: `spotlight|${spec.resultsAt}`,
    end: VERDICT_T.strike,
    events: fixed(c.calm ? [] : spotlightEvents(c)),
  }),
]

const strikeScene = (
  c: Ctx,
  spec: Extract<SceneSpec, { scene: "strike" }>,
): Scene[] => [
  verdictScene(c, spec, {
    name: "strike",
    key: `strike|${spec.resultsAt}|${spec.outcome}`,
    end: VERDICT_END + STRIKE_TAIL_S,
    events: fixed(strikeEvents(c, spec.outcome)),
  }),
]

const verdictAll = (
  c: Ctx,
  spec: Extract<SceneSpec, { scene: "verdict" }>,
): Scene[] => {
  const hasVotes =
    spec.votes.some((count) => count > 0) && spec.outcome !== "none"
  const events = [
    ...timeEvents(c),
    ...(c.host && hasVotes ? countEvents(c, spec.votes) : []),
    ...(c.host && hasVotes && !c.calm ? spotlightEvents(c) : []),
    ...strikeEvents(c, spec.outcome),
  ]

  return [
    verdictScene(c, spec, {
      name: "verdict",
      key: `verdict|${spec.resultsAt}|${spec.outcome}`,
      end: VERDICT_END + STRIKE_TAIL_S,
      events: fixed(events),
    }),
  ]
}

const leaderboard = (
  c: Ctx,
  spec: Extract<SceneSpec, { scene: "leaderboard" }>,
): Scene[] => {
  const rows = Math.min(5, Math.max(0, Math.floor(spec.rows ?? 5)))
  const reorder = BOARD_REORDER_S
  // The prototype's board starts half a bar in, so its first bar line lands
  // eight steps after the scene starts and the reorder sits on a bar line.
  const phase = 8
  const rowEvents = Array.from({ length: rows }, (_, row) => {
    const at = 0.125 + Math.floor((0.08 * row) / S16) * S16

    return [
      ev(at, "whoosh", { dur: 0.28, v: 0.17 }),
      ev(at + 0.12, "flap", { n: 4, v: 0.2 }),
    ]
  }).flat()
  const overtake =
    (spec.overtakes ?? true)
      ? [
          ev(reorder, "whoosh", { dur: 0.6, v: 0.22 }),
          ...[69, 72, 76, 79, 84].map((m, k) =>
            ev(reorder + k * 0.0625, "pluck", {
              m: tr(c, m),
              v: 0.55,
              rev: 0.32,
              dly: 0.2,
              bus: "dry",
            }),
          ),
        ]
      : []

  const groove = (i: number) => {
    const t = i * S16
    const j = i + phase
    const s = mod(j, 16)
    const chord = CHORDS[mod(floorDiv(j, 16) - 1, 4)]
    const on = t >= reorder
    const events: SceneEvent[] = []

    if (s === 0) {
      events.push(
        ev(t, "pad", {
          notes: trAll(c, chord.slice(1)),
          dur: 2,
          v: 0.07,
          cut: 1100,
        }),
      )
    }

    if (s % 4 === 2) {
      events.push(ev(t, "hat", { v: 0.3, d: 0.03 }))
    }

    if (on && s % 4 === 0) {
      events.push(ev(t, "kick", { v: 0.5 }))
    }

    if (on && s % 4 !== 0 && s % 8 !== 6) {
      events.push(
        ev(t, "bass", { m: tr(c, chord[0]), dur: 0.1, cut: 800, v: 0.62 }),
      )
    }

    if (s === 3 || s === 11) {
      events.push(
        ev(t, "stab", {
          notes: trAll(c, chord.slice(1)),
          dur: 0.14,
          v: 0.32,
          cut: 1800,
          rev: 0.25,
          dly: 0.3,
        }),
      )
    }

    if (on && (s === 4 || s === 12)) {
      events.push(ev(t, "clap", { v: 0.38 }))
    }

    if (t >= reorder && t < reorder + 1.25) {
      events.push(ev(t, "tick", { m: 98, v: 0.12 }))
    }

    return events
  }

  return [
    makeScene(
      c,
      {
        name: "leaderboard",
        lane: "bed",
        key: "leaderboard",
        end: Infinity,
        crossfadeS: 0.25,
        cuts: [{ lane: "verdict", fadeS: 0.5 }],
      },
      [fixed([...rowEvents, ...overtake]), stepped(groove)],
    ),
  ]
}

const podium = (
  c: Ctx,
  spec: Extract<SceneSpec, { scene: "podium" }>,
): Scene[] => {
  const places = Math.min(3, Math.max(1, Math.floor(spec.places ?? 3)))
  const shift = (3 - places) * PODIUM_GAP_S
  const roll = PODIUM_T.roll - shift
  const first = PODIUM_T.first - shift
  const hits: SceneEvent[] = []

  if (places >= 3) {
    hits.push(
      ev(PODIUM_T.third, "impact", { v: 0.7, rev: 0.4 }),
      ev(PODIUM_T.third, "stab", {
        notes: trAll(c, [45, 57, 60]),
        dur: 0.8,
        v: 0.7,
        cut: 1600,
        rev: 0.5,
        dly: 0.2,
      }),
    )
  }

  if (places >= 2) {
    const at = PODIUM_T.second - (places === 2 ? PODIUM_GAP_S : 0)

    hits.push(
      ev(at, "impact", { v: 0.85, rev: 0.45 }),
      ev(at, "stab", {
        notes: trAll(c, [41, 57, 60, 65]),
        dur: 0.9,
        v: 0.8,
        cut: 2400,
        rev: 0.5,
        dly: 0.2,
      }),
    )
  }

  hits.push(
    ev(roll, "roll", { dur: first - roll, v: c.calm ? 0.5 : 1 }),
    ev(roll, "riser", { dur: first - roll, v: 0.26, lo: 500, hi: 9000 }),
    ev(first, "impact", { v: 1.2, rev: 0.7 }),
    ev(first, "crash", { v: 0.5, d: 3.4 }),
    ev(first, "chord", {
      notes: trAll(c, [48, 60, 64, 67, 72]),
      v: 1.05,
      dur: 3,
    }),
    ev(first + 1.25, "whoosh", { dur: 0.3, v: 0.16 }),
  )

  // The groove starts on the first bar line after first place has landed.
  const grooveAt = Math.ceil((first + 1) / 2) * 2

  const music = (i: number) => {
    const t = i * S16
    const s = mod(i, 16)
    const bar = floorDiv(i, 16)
    const events: SceneEvent[] = []

    if (s === 0 && t < first) {
      events.push(
        ev(t, "pad", {
          notes: trAll(c, [45, 52, 57]),
          dur: 2,
          v: 0.08,
          cut: mix(500, 1400, progress(t, 0, first)),
        }),
      )
    }

    if (s === 0 && t >= first) {
      events.push(
        ev(t, "pad", {
          notes: trAll(c, LIFT[mod(bar, 4)].slice(1)),
          dur: 2,
          v: 0.1,
          cut: 2200,
        }),
      )
    }

    if (t < grooveAt) {
      return events
    }

    const lift = LIFT[mod(bar, 4)]
    const line = [
      lift[1],
      lift[2],
      lift[3],
      lift[2] + 12,
      lift[3] + 12,
      lift[2] + 12,
      lift[3],
      lift[2],
    ]

    if (s % 4 === 0) {
      events.push(ev(t, "kick", { v: 0.85 }))
    }

    if (s === 4 || s === 12) {
      events.push(ev(t, "clap", { v: 0.5 }))
    }

    if (s % 4 === 2) {
      events.push(ev(t, "hat", { v: 0.45, d: 0.04 }))
    }

    if (s % 4 !== 0 && s % 8 !== 6) {
      events.push(
        ev(t, "bass", { m: tr(c, lift[0]), dur: 0.11, cut: 1000, v: 0.85 }),
      )
    }

    if (s === 3 || s === 6 || s === 11) {
      events.push(
        ev(t, "stab", {
          notes: trAll(c, lift.slice(1)),
          dur: 0.16,
          v: 0.6,
          cut: 3200,
          rev: 0.25,
          dly: 0.28,
        }),
      )
    }

    if (s % 2 === 0) {
      events.push(
        ev(t, "pluck", {
          m: tr(c, line[(s / 2) % 8] + 12),
          v: 0.24,
          rev: 0.22,
          dly: 0.34,
        }),
      )
    }

    return events
  }

  const key = `podium|${places}`

  return [
    makeScene(
      c,
      {
        name: "podium",
        lane: "show",
        key,
        end: first + 2,
        cuts: [
          { lane: "bed", fadeS: 0.4 },
          { lane: "verdict", fadeS: 0.4 },
        ],
      },
      [fixed(hits)],
    ),
    makeScene(
      c,
      {
        name: "finale",
        lane: "bed",
        key: `${key}|finale`,
        end: Infinity,
      },
      [stepped(music)],
    ),
  ]
}

const buildScenes = (spec: SceneSpec, c: Ctx): Scene[] => {
  switch (spec.scene) {
    case "lobby":
      return lobby(c)

    case "title":
      return title(c)

    case "lamps":
      return lamps(c)

    case "roundCard":
      return roundCard(c)

    case "reading":
      return readingScene(c, spec)

    case "answers":
      return answersScene(c, spec)

    case "time":
      return timeScene(c, spec)

    case "count":
      return countScene(c, spec)

    case "spotlight":
      return spotlightScene(c, spec)

    case "strike":
      return strikeScene(c, spec)

    case "verdict":
      return verdictAll(c, spec)

    case "leaderboard":
      return leaderboard(c, spec)

    case "podium":
      return podium(c, spec)

    default:
      return []
  }
}

const contextOf = (options: CompileOptions): Ctx => ({
  rise: options.rise,
  calm: options.intensity === "calm",
  final: options.final,
  host: options.surface === "host",
})

/**
 * The scenes a spec plays, or none: silent never plays, and a phone skips the
 * projector-only beats. Usually one scene; the podium is two, its hits on the
 * `show` lane and its groove on the `bed` lane.
 */
export const compileScene = (
  spec: SceneSpec,
  options: CompileOptions,
): Scene[] => {
  if (options.intensity === "silent") {
    return []
  }

  if (options.surface === "player" && HOST_ONLY.has(spec.scene)) {
    return []
  }

  return buildScenes(spec, contextOf(options))
}

const PLACE_HITS = {
  3: { v: 0.7, rev: 0.4 },
  2: { v: 0.85, rev: 0.45 },
  1: { v: 1.2, rev: 0.7 },
} as const

const placeCue = (c: Ctx, place: 1 | 2 | 3) => {
  const hit = ev(0, "impact", PLACE_HITS[place])

  if (place === 1) {
    return [
      hit,
      ev(0, "crash", { v: 0.5, d: 3.4 }),
      ev(0, "chord", {
        notes: trAll(c, [48, 60, 64, 67, 72]),
        v: 1.05,
        dur: 3,
      }),
    ]
  }

  const stabNotes = place === 3 ? [45, 57, 60] : [41, 57, 60, 65]

  return [
    hit,
    ev(0, "stab", {
      notes: trAll(c, stabNotes),
      dur: place === 3 ? 0.8 : 0.9,
      v: place === 3 ? 0.7 : 0.8,
      cut: place === 3 ? 1600 : 2400,
      rev: 0.5,
      dly: 0.2,
    }),
  ]
}

const cueEvents = (cue: Cue, c: Ctx) => {
  switch (cue.cue) {
    case "join":
      return [
        ev(0, "flap", { n: 6, v: 0.2 }),
        ev(0.02, "pluck", {
          m: tr(c, PENT[mod(cue.index, PENT.length)]),
          v: 0.42,
          rev: 0.35,
          dly: 0.2,
          bus: "dry",
        }),
      ]

    case "pop":
      return [
        ev(0, "pluck", {
          m: tr(c, PENT[Math.min(Math.max(0, cue.index), PENT.length - 1)]),
          v: 0.5,
          rev: 0.22,
          dly: 0.1,
          bus: "dry",
        }),
      ]

    case "tick":
      return [
        ev(0, "tick", {
          m: tr(
            c,
            TICK_SCALE[Math.min(Math.max(0, cue.index), TICK_SCALE.length - 1)],
          ),
          v: 0.95,
        }),
      ]

    case "lamp":
      return [
        ev(0, "clunk", {
          m: tr(
            c,
            LAMP_NOTES[Math.min(Math.max(0, cue.k), LAMP_NOTES.length - 1)],
          ),
          v: 1,
        }),
      ]

    case "go":
      return [
        ev(0, "impact", { v: 1, rev: 0.4 }),
        ev(0, "stab", {
          notes: trAll(c, [57, 60, 64, 69]),
          dur: 0.5,
          v: 0.9,
          cut: 4200,
          rev: 0.4,
          dly: 0.2,
        }),
      ]

    case "whoosh":
      return [ev(0, "whoosh", { dur: 0.5, v: 0.22 })]

    case "impact":
      return [ev(0, "impact", { v: 1, rev: 0.5 })]

    case "place":
      return placeCue(c, cue.place)

    case "roll": {
      const dur = Math.max(0.5, cue.ms / 1000)

      return [
        ev(0, "roll", { dur, v: c.calm ? 0.5 : 1 }),
        ev(0, "riser", { dur, v: 0.26, lo: 500, hi: 9000 }),
      ]
    }

    default:
      return []
  }
}

/** A cue's voices, all at time 0, or none when the intensity or surface forbids it. */
export const compileCue = (cue: Cue, options: CompileOptions) => {
  if (options.intensity === "silent") {
    return []
  }

  if (options.surface === "player" && HOST_ONLY_CUES.has(cue.cue)) {
    return []
  }

  const c = contextOf(options)
  const events = cueEvents(cue, c)

  return c.calm ? events.filter((e) => !isCalmDrop(e.inst)) : events
}
