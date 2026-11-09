import { NO_TIME_LIMIT } from "@razzia/common/constants"
import {
  ANSWER_REVEAL_INITIAL_DELAY_MS,
  ANSWER_REVEAL_SLOT_INTERVAL_MS,
  getAnswerRevealDuration,
  getVisibleAnswerCount,
} from "@razzia/common/utils/answer-reveal"
import {
  type InstrumentName,
  S16,
  type SceneEvent,
} from "@razzia/web/features/game/audio/instruments"
import {
  BOARD_REORDER_S,
  type Cue,
  type CompileOptions,
  compileCue,
  compileScene,
  answersSpec,
  originMs,
  PODIUM_T,
  readingSpec,
  RISE_CAP,
  riseFor,
  type SceneSpec,
  unlockStamp,
  VERDICT_T,
  verdictOf,
  verdictSpec,
} from "@razzia/web/features/game/audio/scenes"
import { describe, expect, it } from "vitest"

const FULL: CompileOptions = {
  intensity: "full",
  surface: "host",
  rise: 0,
  final: false,
}

const CALM: CompileOptions = { ...FULL, intensity: "calm" }

const SERVER = 5_000_000

const answers = (
  count: number,
  time = 14,
): Extract<SceneSpec, { scene: "answers" }> => ({
  scene: "answers",
  revealStartedAt: SERVER,
  unlockAt: SERVER + getAnswerRevealDuration(count),
  serverNow: SERVER,
  answers: count,
  time,
})

/** Every event of a scene between two times, as a flat list. */
const events = (
  spec: SceneSpec,
  options: CompileOptions = FULL,
  [from, to]: readonly [number, number] = [-30, 60],
): SceneEvent[] =>
  compileScene(spec, options).flatMap((scene) => scene.events(from, to))

const of = (list: readonly SceneEvent[], inst: InstrumentName) =>
  list.filter((event) => event.inst === inst)

const times = (list: readonly SceneEvent[]) => list.map((event) => event.t)

describe("answers scene against the server's reveal schedule", () => {
  it("lands one clunk per answer at the +1, +4, +7, +10 s slots", () => {
    const list = events(answers(4))
    const slots = times(of(list, "clunk"))

    // Seconds after the reveal start, then re-expressed before the unlock.
    const expected = [0, 1, 2, 3].map(
      (k) =>
        (ANSWER_REVEAL_INITIAL_DELAY_MS + k * ANSWER_REVEAL_SLOT_INTERVAL_MS) /
          1000 -
        12,
    )

    expect(slots).toEqual(expected)
    expect(slots).toEqual([-11, -8, -5, -2])
  })

  it("agrees with when the screens show each slot", () => {
    for (const [k, slot] of [-11, -8, -5, -2].entries()) {
      const elapsedMs = (slot + 12) * 1000

      // The slot's answer is the first one visible at exactly that moment.
      expect(getVisibleAnswerCount(4, elapsedMs)).toBe(k + 1)
      expect(getVisibleAnswerCount(4, elapsedMs - 1)).toBe(k)
    }
  })

  it("drops exactly on the unlock, and nowhere before it", () => {
    const list = events(answers(4))
    const drop = list.filter((event) => event.t === 0 && event.inst !== "kick")

    expect(of(drop, "impact")).toHaveLength(1)
    expect(of(drop, "crash")).toHaveLength(1)
    expect(of(drop, "chord")).toHaveLength(1)
    expect(of(list, "impact").filter((event) => event.t < 0)).toEqual([])
  })

  it("keeps every beat on the sixteenth-note grid around the unlock", () => {
    const list = events(answers(4))
    const onGrid = list.filter(
      (event) => !["tick", "riser", "clunk"].includes(event.inst),
    )

    for (const event of onGrid) {
      const step = event.t / S16

      // Chord and arp voices may sit a sixteenth-of-a-sixteenth after the step.
      expect(
        Math.abs(step - Math.round(step)) < 1e-9 || event.inst === "chord",
      ).toBe(true)
    }
  })

  it("shifts the whole scene for three and two answers, still on the unlock", () => {
    for (const count of [3, 2]) {
      const list = events(answers(count))
      const reveal = getAnswerRevealDuration(count) / 1000
      const slots = times(of(list, "clunk"))

      expect(slots).toHaveLength(count)
      expect(slots[0]).toBe(-reveal + 1)
      expect(of(list, "impact").map((event) => event.t)).toEqual([0])
    }
  })

  it("adds one layer per answer, then everything at the unlock", () => {
    const list = events(answers(4))
    const first = (inst: InstrumentName, since = -30) =>
      Math.min(...times(of(list, inst).filter((event) => event.t >= since)))

    // Hats from the first slot, bass from the second, arp from the third,
    // a filtered kick from the fourth.
    expect(first("hat")).toBeGreaterThanOrEqual(-11)
    expect(first("hat")).toBeLessThan(-8)
    expect(first("bass")).toBeGreaterThanOrEqual(-8)
    expect(first("bass")).toBeLessThan(-5)
    expect(first("pluck")).toBeGreaterThanOrEqual(-5)
    expect(first("pluck")).toBeLessThan(-2)
    expect(first("kick")).toBeGreaterThanOrEqual(-2)

    const before = of(list, "kick").filter((event) => event.t < 0)

    expect(before.length).toBeGreaterThan(0)
    expect(before.every((event) => "lp" in event.p && event.p.lp === 380)).toBe(
      true,
    )
    // Claps and stabs are the drop's: none before it.
    expect(of(list, "clap").filter((event) => event.t < 0)).toEqual([])
  })

  it("with two answers, every layer still arrives at the unlock", () => {
    const list = events(answers(2))

    expect(of(list, "kick").some((event) => event.t >= 0)).toBe(true)
    expect(of(list, "clap").some((event) => event.t >= 0)).toBe(true)
  })

  it("keeps power-on near silent: the quiet layers are an order below the drop", () => {
    const list = events(answers(4))
    const pre = list.filter((event) => event.t < 0)
    const peak = (inst: InstrumentName) =>
      Math.max(
        ...of(pre, inst).map((event) =>
          "v" in event.p ? (event.p.v ?? 0) : 0,
        ),
      )

    expect(peak("clunk")).toBeLessThanOrEqual(0.22)
    expect(peak("pluck")).toBeLessThanOrEqual(0.08)
    expect(peak("bass")).toBeLessThanOrEqual(0.17)
    expect(peak("kick")).toBeLessThanOrEqual(0.16)
  })

  it("ticks climb the scale over the last five seconds, one a second", () => {
    const list = events(answers(4, 14))
    const ticks = of(list, "tick")

    expect(times(ticks)).toEqual([9, 10, 11, 12, 13])
    expect(ticks.map((event) => ("m" in event.p ? event.p.m : 0))).toEqual([
      81, 84, 86, 88, 93,
    ])
    // The track tightens: a 16th-note hat appears only after the five begin.
    const tight = of(list, "hat").filter(
      (event) => "d" in event.p && event.p.d === 0.018 && event.t >= 9,
    )

    expect(tight.length).toBeGreaterThan(0)
    expect(of(list, "riser").map((event) => event.t)).toContain(9)
  })

  it("has no ticks, riser or end for an untimed question", () => {
    const spec = answers(4, NO_TIME_LIMIT)
    const [scene] = compileScene(spec, FULL)

    expect(scene.end).toBe(Infinity)
    expect(of(events(spec, FULL, [0, 200]), "tick")).toEqual([])
  })

  it("stops its groove at TIME and leaves TIME to the verdict", () => {
    const list = events(answers(4, 14), FULL, [0, 60])

    expect(
      Math.max(...times(list.filter((event) => event.inst === "kick"))),
    ).toBeLessThan(14)
    expect(of(list, "impact")).toHaveLength(1)
  })

  it("windows partition the timeline: no step is repeated or skipped", () => {
    const [scene] = compileScene(answers(4), FULL)
    const whole = scene.events(-12, 14)
    const parts = [-12, -3.3, 0, 0.1, 7.25, 14].flatMap((from, index, edges) =>
      index === 0 ? [] : scene.events(edges[index - 1], from),
    )

    expect(parts).toHaveLength(whole.length)
    expect(times(parts).sort((a, b) => a - b)).toEqual(
      times(whole).sort((a, b) => a - b),
    )
  })

  it("anchors to the unlock stamp, ignoring the two machines' clocks", () => {
    const spec = answers(4)
    const [scene] = compileScene(spec, FULL)
    const received = 9_000_000

    // The payload left the server 3 s into the reveal: the unlock is 9 s away.
    const live = { ...spec, serverNow: SERVER + 3000 }
    const [liveScene] = compileScene(live, FULL)

    expect(originMs(liveScene.anchor, received)).toBe(received + 9000)
    // A reconnect after the unlock: the drop is already 2 s old.
    const late = { ...spec, serverNow: spec.unlockAt + 2000 }
    const [lateScene] = compileScene(late, FULL)

    expect(originMs(lateScene.anchor, received)).toBe(received - 2000)
    expect(scene.key).toBe(liveScene.key)
  })
})

describe("unlockStamp", () => {
  const data = { unlockAt: 12_000, serverNow: 4_000, answeringOpen: false }

  it("uses unlockAt while answers are still powering on", () => {
    expect(unlockStamp(data)).toBe(12_000)
  })

  it("uses the opening payload's own clock when a manager skipped the wait", () => {
    expect(unlockStamp({ ...data, answeringOpen: true })).toBe(4_000)
  })

  it("keeps unlockAt when the server opened right on time", () => {
    expect(
      unlockStamp({ ...data, serverNow: 12_040, answeringOpen: true }),
    ).toBe(12_000)
  })
})

describe("reading", () => {
  const spec: SceneSpec = {
    scene: "reading",
    chargeAt: 100_000,
    chargeMs: 5000,
    serverNow: 96_000,
  }

  it("is near silence until the charge, then swells and ends with it", () => {
    const [scene] = compileScene(spec, FULL)
    const list = scene.events(-10, 10)
    const pads = of(list, "pad")

    expect(scene.end).toBe(5)
    expect(pads.length).toBeGreaterThan(0)
    expect(
      Math.max(...pads.map((event) => ("v" in event.p ? (event.p.v ?? 0) : 0))),
    ).toBeLessThan(0.12)
    expect(
      pads
        .filter((event) => event.t < 0)
        .every((event) => "v" in event.p && event.p.v === 0.06),
    ).toBe(true)
    expect(of(list, "riser").map((event) => event.t)).toEqual([0])
    expect(Math.max(...times(list))).toBeLessThan(5)
  })
})

describe("the verdict", () => {
  const verdict = (
    outcome: "right" | "wrong" | "none",
    votes = [3, 8, 4, 2],
  ): SceneSpec => ({
    scene: "verdict",
    resultsAt: 70_000,
    serverNow: 70_000,
    votes,
    outcome,
  })

  it("lands TIME, the count, the spotlight and the strike at the plan's offsets", () => {
    const list = events(verdict("right"), FULL, [-1, 20])
    const impacts = of(list, "impact").map((event) => event.t)

    expect(impacts).toEqual([VERDICT_T.time, VERDICT_T.strike])
    // The screens' staged reveal runs on these same numbers.
    expect(VERDICT_T).toEqual({
      time: 0,
      count: 0.6,
      spotlight: 2.25,
      strike: 3,
    })

    const ticks = of(list, "tick")

    expect(Math.min(...times(ticks))).toBeGreaterThanOrEqual(VERDICT_T.count)
    expect(Math.max(...times(ticks))).toBeLessThan(VERDICT_T.spotlight + 0.01)
    expect(of(list, "swell").map((event) => event.t)).toEqual([
      VERDICT_T.spotlight,
    ])
    expect(of(list, "chord").map((event) => event.t)).toEqual([
      VERDICT_T.strike,
    ])
  })

  it("gives the count a tick per step, climbing, with the smallest bar first", () => {
    const list = of(events(verdict("right"), FULL, [-1, 20]), "tick")
    const notes = list.map((event) => ("m" in event.p ? event.p.m : 0))

    // Votes 3, 8, 4, 2: ranks start at answer D (2) then A (3), C (4), B (8).
    expect(notes[0]).toBe(69)
    expect(Math.min(...notes)).toBe(69)
    expect(Math.max(...notes)).toBeLessThanOrEqual(69 + 9 + 2 * 7)
  })

  it("sounds different when the crowd was right and when it was wrong", () => {
    const [right] = of(events(verdict("right"), FULL, [-1, 20]), "chord")
    const [wrong] = of(events(verdict("wrong"), FULL, [-1, 20]), "chord")

    expect(right.p).not.toEqual(wrong.p)
    // Major for a right crowd, minor for a wrong one.
    expect("notes" in right.p && right.p.notes).toEqual([48, 60, 64, 67, 72])
    expect("notes" in wrong.p && wrong.p.notes).toEqual([45, 57, 60, 64, 69])
  })

  it("decays within about six seconds so a teacher can talk", () => {
    const [scene] = compileScene(verdict("right"), FULL)
    const list = scene.events(0, 20)
    const tail = list.filter((event) => event.t > VERDICT_T.strike)

    expect(Math.max(...times(tail))).toBeLessThanOrEqual(VERDICT_T.strike + 5)
    // Each pad of the tail is quieter than the last.
    const pads = of(tail, "pad").map((event) =>
      "v" in event.p ? (event.p.v ?? 0) : 0,
    )

    expect(pads).toEqual([...pads].sort((a, b) => b - a))
    expect(Math.max(...pads)).toBeLessThanOrEqual(0.1)
  })

  it("plays no count or spotlight when nobody answered", () => {
    const list = events(verdict("none", [0, 0, 0, 0]), FULL, [-1, 20])

    expect(of(list, "tick")).toEqual([])
    expect(of(list, "swell")).toEqual([])
    expect(of(list, "chord")).toHaveLength(1)
    expect(of(list, "crash")).toEqual([])
  })

  it("cuts the answering groove at TIME, and at a phone's strike", () => {
    const [verdictScene] = compileScene(verdict("right"), FULL)
    const [strike] = compileScene(
      { scene: "strike", resultsAt: 1, serverNow: 1, outcome: "right" },
      FULL,
    )
    const [time] = compileScene(
      { scene: "time", resultsAt: 1, serverNow: 1 },
      FULL,
    )

    expect(verdictScene.cuts.map((cut) => cut.lane)).toEqual(["bed"])
    expect(time.cuts.map((cut) => cut.lane)).toEqual(["bed"])
    // A phone starts only the strike, so it is what stops the answers bed there.
    expect(strike.cuts.map((cut) => cut.lane)).toEqual(["bed"])
  })

  it("leaves the count and the spotlight to ring on the verdict lane", () => {
    const stamps = { resultsAt: 1, serverNow: 1 }
    const [count] = compileScene(
      { scene: "count", ...stamps, votes: [1, 2] },
      FULL,
    )
    const [spotlight] = compileScene({ scene: "spotlight", ...stamps }, FULL)

    expect(count.cuts).toEqual([])
    expect(spotlight.cuts).toEqual([])
  })

  it("is the same events whether called as one verdict or as four scenes", () => {
    const stamps = { resultsAt: 70_000, serverNow: 70_000 }
    const parts = [
      { scene: "time", ...stamps },
      { scene: "count", ...stamps, votes: [3, 8, 4, 2] },
      { scene: "spotlight", ...stamps },
      { scene: "strike", ...stamps, outcome: "right" },
    ] as const
    const split = parts.flatMap((part) => events(part, FULL, [-1, 20]))
    const whole = events(verdict("right"), FULL, [-1, 20])
    const key = (event: SceneEvent) =>
      `${event.t}|${event.inst}|${JSON.stringify(event.p)}`

    expect(split.map(key).sort()).toEqual(whole.map(key).sort())
  })
})

describe("the podium", () => {
  const podium = (places: number): SceneSpec => ({ scene: "podium", places })

  it("plays third, second, a roll and first on the plan's schedule", () => {
    const list = events(podium(3), FULL, [0, 30])
    const impactTimes = of(list, "impact").map((event) => event.t)

    expect(impactTimes).toEqual([
      PODIUM_T.third,
      PODIUM_T.second,
      PODIUM_T.first,
    ])
    expect(of(list, "roll").map((event) => event.t)).toEqual([PODIUM_T.roll])
    expect(of(list, "roll")[0].p).toMatchObject({
      dur: PODIUM_T.first - PODIUM_T.roll,
    })
  })

  it("skips empty places and moves the rest earlier", () => {
    const two = events(podium(2), FULL, [0, 30])
    const one = events(podium(1), FULL, [0, 30])

    expect(of(two, "impact").map((event) => event.t)).toEqual([1, 6.5])
    expect(of(one, "roll").map((event) => event.t)).toEqual([0])
    expect(of(one, "impact").map((event) => event.t)).toEqual([4])
  })

  it("is two scenes: its hits on the show lane and its groove on the bed", () => {
    const scenes = compileScene(podium(3), FULL)

    expect(scenes.map((scene) => scene.lane)).toEqual(["show", "bed"])
    expect(scenes[0].cuts.map((cut) => cut.lane).sort()).toEqual([
      "bed",
      "verdict",
    ])
  })

  it("starts the finale groove on a bar line after first place", () => {
    const [, finale] = compileScene(podium(3), FULL)
    const kicks = of(finale.events(0, 40), "kick").map((event) => event.t)

    expect(Math.min(...kicks)).toBe(10)
    expect(Math.min(...kicks) % 2).toBe(0)
  })
})

describe("the leaderboard", () => {
  it("kicks the groove in and reorders at BOARD_REORDER_S", () => {
    const list = events(
      { scene: "leaderboard", rows: 5, overtakes: true },
      FULL,
      [0, 20],
    )
    const kicks = of(list, "kick").map((event) => event.t)

    expect(Math.min(...kicks)).toBeGreaterThanOrEqual(BOARD_REORDER_S)
    expect(of(list, "pluck").some((event) => event.t === BOARD_REORDER_S)).toBe(
      true,
    )
    expect(
      of(list, "whoosh").some((event) => event.t === BOARD_REORDER_S),
    ).toBe(true)
  })

  it("skips the overtake flourish when nobody moved", () => {
    const list = events(
      { scene: "leaderboard", overtakes: false },
      FULL,
      [0, 20],
    )

    expect(of(list, "pluck")).toEqual([])
  })

  it("replaces the verdict's tail when it starts", () => {
    const [board] = compileScene({ scene: "leaderboard" }, FULL)

    expect(board.cuts.map((cut) => cut.lane)).toEqual(["verdict"])
    expect(board.end).toBe(Infinity)
  })
})

describe("the round climb", () => {
  it("rises a semitone a round and holds at the cap", () => {
    expect([1, 2, 3, 6].map((round) => riseFor(round, 6).rise)).toEqual([
      0, 1, 2, 5,
    ])
    expect(riseFor(12, 20).rise).toBe(RISE_CAP)
    expect(riseFor(0, 0)).toEqual({ rise: 0, final: false })
  })

  it("flags the last question, and only that one", () => {
    expect(riseFor(5, 6).final).toBe(false)
    expect(riseFor(6, 6).final).toBe(true)
    expect(riseFor(1, 1).final).toBe(true)
  })

  it("raises every pitch by the round's semitones, nothing else", () => {
    const spec = answers(4)
    const base = events(spec, FULL)
    const up = events(spec, { ...FULL, rise: 3 })

    expect(up).toHaveLength(base.length)

    for (const [index, event] of base.entries()) {
      const shifted = up[index]

      expect(shifted.inst).toBe(event.inst)
      expect(shifted.t).toBe(event.t)

      if ("m" in event.p && "m" in shifted.p) {
        expect(shifted.p.m).toBe(event.p.m + 3)
      } else if ("notes" in event.p && "notes" in shifted.p) {
        expect(shifted.p.notes).toEqual(event.p.notes.map((note) => note + 3))
      } else {
        expect(shifted.p).toEqual(event.p)
      }
    }
  })

  it("adds a layer on the final question, in the answering groove", () => {
    const spec = answers(4)
    const base = events(spec, FULL)
    const final = events(spec, { ...FULL, final: true })
    const extra = final.length - base.length

    expect(extra).toBeGreaterThan(0)
    // The extra voices are bright plucks above the groove, after the unlock.
    const keys = new Set(base.map((event) => JSON.stringify(event)))
    const added = final.filter((event) => !keys.has(JSON.stringify(event)))

    expect(added.every((event) => event.inst === "pluck" && event.t >= 0)).toBe(
      true,
    )
  })

  it("never lifts a high note out of hearing at the cap", () => {
    const top = events(answers(4), { ...FULL, rise: RISE_CAP }, [-12, 14])
    const highest = Math.max(
      ...top.flatMap((event) => ("m" in event.p ? [event.p.m] : [])),
    )

    // MIDI 98 is D7 (2.3 kHz); the tick's octave partial stays under 10 kHz.
    expect(highest).toBeLessThanOrEqual(98)
  })
})

describe("intensity", () => {
  const everyScene: SceneSpec[] = [
    { scene: "lobby" },
    { scene: "title" },
    { scene: "lamps" },
    { scene: "roundCard" },
    { scene: "reading", chargeAt: 10_000, chargeMs: 5000, serverNow: 9000 },
    answers(4),
    { scene: "time", resultsAt: 1, serverNow: 1 },
    { scene: "count", resultsAt: 1, serverNow: 1, votes: [1, 2, 3, 4] },
    { scene: "spotlight", resultsAt: 1, serverNow: 1 },
    { scene: "strike", resultsAt: 1, serverNow: 1, outcome: "right" },
    { scene: "strike", resultsAt: 1, serverNow: 1, outcome: "wrong" },
    {
      scene: "verdict",
      resultsAt: 1,
      serverNow: 1,
      votes: [1, 2, 3, 4],
      outcome: "right",
    },
    { scene: "leaderboard" },
    { scene: "podium", places: 3 },
  ]

  it("is silent: nothing compiles, for scenes or cues", () => {
    const silent: CompileOptions = { ...FULL, intensity: "silent" }

    for (const spec of everyScene) {
      expect(compileScene(spec, silent)).toEqual([])
    }

    expect(compileCue({ cue: "pop", index: 0 }, silent)).toEqual([])
  })

  it("calm: no impact, crash or riser anywhere", () => {
    for (const spec of everyScene) {
      const list = events(spec, CALM, [-30, 200])

      for (const inst of ["impact", "crash", "riser"] as const) {
        expect(of(list, inst)).toEqual([])
      }
    }
  })

  it("calm: no groove once answers open", () => {
    const list = events(answers(4), CALM, [0, 14])

    for (const inst of ["kick", "hat", "bass", "clap", "stab"] as const) {
      expect(of(list, inst)).toEqual([])
    }

    // The ticks still count the room down.
    expect(of(list, "tick")).toHaveLength(5)
  })

  it("calm: the verdict is a soft chord with the same major or minor colour", () => {
    const strike = (outcome: "right" | "wrong") =>
      events(
        { scene: "strike", resultsAt: 1, serverNow: 1, outcome },
        CALM,
        [0, 20],
      )
    const right = of(strike("right"), "chord")
    const wrong = of(strike("wrong"), "chord")

    expect(right).toHaveLength(1)
    expect("v" in right[0].p && right[0].p.v).toBeLessThan(1)
    expect(right[0].p).not.toEqual(wrong[0].p)
    expect(of(strike("right"), "impact")).toEqual([])
  })

  it("calm: TIME is a soft note, and the spotlight is gone", () => {
    const time = events(
      { scene: "time", resultsAt: 1, serverNow: 1 },
      CALM,
      [-1, 5],
    )

    expect(time.map((event) => event.inst)).toEqual(["pluck"])
    expect(
      events({ scene: "spotlight", resultsAt: 1, serverNow: 1 }, CALM, [0, 20]),
    ).toEqual([])
  })

  it("full keeps every voice", () => {
    const list = events(answers(4), FULL, [-12, 14])

    for (const inst of ["impact", "crash", "riser", "kick", "clap"] as const) {
      expect(of(list, inst).length).toBeGreaterThan(0)
    }
  })
})

describe("surface", () => {
  it("a phone skips the projector-only beats and keeps its own", () => {
    const phone: CompileOptions = { ...FULL, surface: "player" }

    for (const spec of [
      { scene: "lobby" },
      { scene: "title" },
      { scene: "lamps" },
      { scene: "leaderboard" },
      { scene: "podium", places: 3 },
    ] as const) {
      expect(compileScene(spec, phone)).toEqual([])
    }

    expect(compileScene(answers(4), phone)).toHaveLength(1)
    expect(compileScene({ scene: "roundCard" }, phone)).toHaveLength(1)
  })

  it("a phone's verdict has TIME and the strike but not the count or spotlight", () => {
    const list = events(
      {
        scene: "verdict",
        resultsAt: 1,
        serverNow: 1,
        votes: [1, 2, 3, 4],
        outcome: "right",
      },
      { ...FULL, surface: "player" },
      [-1, 20],
    )

    expect(of(list, "tick")).toEqual([])
    expect(of(list, "swell")).toEqual([])
    expect(of(list, "chord")).toHaveLength(1)
  })
})

describe("cues", () => {
  it("walk up the pentatonic as joins and answers arrive", () => {
    const note = (cue: Cue) => {
      const [first] = compileCue(cue, FULL).filter(
        (event) => event.inst === "pluck",
      )

      return "m" in first.p ? first.p.m : 0
    }

    expect(note({ cue: "pop", index: 0 })).toBeLessThan(
      note({ cue: "pop", index: 4 }),
    )
    expect(note({ cue: "pop", index: 99 })).toBe(93)
    expect(note({ cue: "join", index: 0 })).toBe(69)
  })

  it("seed a join's flap from its index, so a burst of joins is not one voice", () => {
    const flapOf = (index: number) =>
      compileCue({ cue: "join", index }, FULL).find(
        (event) => event.inst === "flap",
      )?.p

    expect(flapOf(0)).toEqual({ n: 6, v: 0.2, k: 0 })
    expect(flapOf(7)).toEqual({ n: 6, v: 0.2, k: 7 })
  })

  it("play now: every voice is at or just after time zero", () => {
    for (const cue of [
      { cue: "join", index: 2 },
      { cue: "pop", index: 2 },
      { cue: "tick", index: 2 },
      { cue: "lamp", k: 1 },
      { cue: "go" },
      { cue: "place", place: 1 },
      { cue: "roll", ms: 3000 },
    ] as const) {
      const list = compileCue(cue, FULL)

      expect(list.length).toBeGreaterThan(0)
      expect(Math.min(...times(list))).toBe(0)
    }
  })

  it("calm drops the cues' hits; a phone skips the host-only cues", () => {
    expect(compileCue({ cue: "go" }, CALM).map((event) => event.inst)).toEqual([
      "stab",
    ])
    expect(
      compileCue({ cue: "join", index: 0 }, { ...FULL, surface: "player" }),
    ).toEqual([])
    expect(
      compileCue({ cue: "pop", index: 0 }, { ...FULL, surface: "player" }),
    ).toHaveLength(1)
  })
})

describe("spec helpers: what a screen passes from the data it already has", () => {
  it("readingSpec charges after the prompt has finished appearing, for the cooldown", () => {
    const spec = readingSpec({
      promptStartedAt: 10_000,
      question: "A short question?",
      cooldown: 5,
      serverNow: 10_020,
    })

    // One sentence: the prompt takes 950 ms to enter.
    expect(spec).toEqual({
      scene: "reading",
      chargeAt: 10_950,
      chargeMs: 5000,
      serverNow: 10_020,
    })
  })

  it("answersSpec is the same call while powering on and once open", () => {
    const data = {
      revealStartedAt: 20_000,
      unlockAt: 32_000,
      serverNow: 20_000,
      answeringOpen: false,
      answers: ["a", "b", "c", "d"],
      time: 14,
    }
    const closed = answersSpec(data)
    const open = answersSpec({
      ...data,
      serverNow: 32_030,
      answeringOpen: true,
    })

    expect(closed).toMatchObject({
      scene: "answers",
      answers: 4,
      time: 14,
      unlockAt: 32_000,
    })
    expect(open).toMatchObject({ unlockAt: 32_000, answers: 4 })
    expect(compileScene(closed, FULL)[0].key).toBe(
      compileScene(open, FULL)[0].key,
    )
  })

  it("answersSpec moves the drop to now when a manager skipped the wait", () => {
    const skipped = answersSpec({
      revealStartedAt: 20_000,
      unlockAt: 32_000,
      serverNow: 25_000,
      answeringOpen: true,
      answers: ["a", "b"],
      time: 14,
    })

    expect(skipped).toMatchObject({ unlockAt: 25_000, answers: 2 })
  })

  it("verdictOf: right when a most-picked answer is a solution", () => {
    expect(verdictOf({ 0: 12, 1: 3, 2: 1 }, [0], 4)).toEqual({
      votes: [12, 3, 1, 0],
      outcome: "right",
    })
  })

  it("verdictOf: wrong when the crowd fell for another answer", () => {
    expect(verdictOf({ 0: 3, 1: 8, 2: 4, 3: 2 }, [0], 4).outcome).toBe("wrong")
  })

  it("verdictOf: a tie that includes a right answer keeps the light on it", () => {
    expect(verdictOf({ 0: 5, 1: 5 }, [1], 4).outcome).toBe("right")
    expect(verdictOf({ 0: 5, 1: 5 }, [2], 4).outcome).toBe("wrong")
  })

  it("verdictOf: several right answers count if any of them leads", () => {
    expect(verdictOf({ 0: 2, 2: 9 }, [0, 2], 4).outcome).toBe("right")
  })

  it("verdictOf: nobody answered", () => {
    expect(verdictOf({}, [0], 4)).toEqual({
      votes: [0, 0, 0, 0],
      outcome: "none",
    })
  })

  it("verdictSpec is the whole verdict at the results stamp", () => {
    expect(
      verdictSpec({
        resultsAt: 70_000,
        serverNow: 70_010,
        responses: { 1: 8 },
        solutions: [0],
        answerCount: 4,
      }),
    ).toEqual({
      scene: "verdict",
      resultsAt: 70_000,
      serverNow: 70_010,
      votes: [0, 8, 0, 0],
      outcome: "wrong",
    })
  })
})
