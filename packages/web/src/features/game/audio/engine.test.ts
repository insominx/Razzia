import {
  createEngine,
  DRIFT_S,
  LOOKAHEAD_S,
  MAX_LATE_S,
  PUMP_MS,
} from "@razzia/web/features/game/audio/engine"
import type {
  Bus,
  InstrumentName,
  SceneEvent,
} from "@razzia/web/features/game/audio/instruments"
import {
  compileScene,
  type SceneSpec,
} from "@razzia/web/features/game/audio/scenes"
import {
  asContext,
  fakeContext,
  fakeGraph,
  type FakeNode,
  manualClock,
} from "@razzia/web/features/game/audio/test-support"
import { describe, expect, it } from "vitest"

interface Played {
  bus: Bus
  event: SceneEvent
  when: number
}

const OPTIONS = {
  intensity: "full",
  surface: "host",
  rise: 0,
  final: false,
} as const

const setup = (levelDb?: (lane: string) => number) => {
  const ctx = fakeContext()
  const clock = manualClock()
  const played: Played[] = []
  const engine = createEngine({
    ctx: asContext(ctx),
    graph: fakeGraph(ctx),
    now: clock.now,
    play: (bus, event, when) => {
      played.push({ bus, event, when })
    },
    timers: {
      set: clock.setTimeout,
      clear: clock.clearTimeout,
    },
    levelDb,
  })

  /** Moves both clocks together, running the pump every 25 ms like the controller. */
  const run = (ms: number) => {
    for (let spent = 0; spent < ms; spent += PUMP_MS) {
      clock.advance(PUMP_MS)
      ctx.currentTime += PUMP_MS / 1000
      engine.pump()
    }
  }

  const scenes = (spec: SceneSpec) => compileScene(spec, OPTIONS)

  const start = (spec: SceneSpec, originMs: number) => {
    const [scene, ...rest] = scenes(spec)

    return [
      engine.start(scene, originMs),
      ...rest.map((s) => engine.start(s, originMs)),
    ]
  }

  return { ctx, clock, played, engine, run, scenes, start }
}

const answers = (unlockInMs: number, time = 14): SceneSpec => ({
  scene: "answers",
  revealStartedAt: 0,
  unlockAt: unlockInMs,
  serverNow: 0,
  answers: 4,
  time,
})

const of = (list: readonly Played[], inst: InstrumentName) =>
  list.filter((entry) => entry.event.inst === inst)

const gainCalls = (bus: Bus, method: string) =>
  (bus.dry as unknown as FakeNode).gain.calls.filter(
    (call) => call.method === method,
  )

describe("engine scheduling", () => {
  it("hands over only what falls inside the look-ahead", () => {
    const { clock, played, engine, start } = setup()

    start({ scene: "lamps" }, clock.now() + 1000)
    engine.pump()

    expect(played).toEqual([])

    clock.advance(900)
    engine.pump()

    // The first clunk is 100 ms away, inside the 200 ms look-ahead.
    expect(of(played, "clunk")).toHaveLength(1)
    expect(LOOKAHEAD_S).toBeGreaterThan(0.1)
  })

  it("places each event on the audio clock at its wall time", () => {
    const { ctx, clock, played, engine, start } = setup()

    ctx.currentTime = 10
    start({ scene: "lamps" }, clock.now() + 500)
    clock.advance(400)
    ctx.currentTime += 0.4
    engine.pump()

    const [clunk] = of(played, "clunk")

    // 100 ms after "now" on both clocks, to within a hair.
    expect(clunk.when).toBeCloseTo(ctx.currentTime + 0.1, 3)
  })

  it("never schedules an event twice, however often it pumps", () => {
    const { clock, played, run, start } = setup()

    start({ scene: "lamps" }, clock.now())
    run(5000)

    expect(of(played, "clunk")).toHaveLength(3)
    expect(of(played, "impact")).toHaveLength(1)
    expect(of(played, "stab")).toHaveLength(1)
  })

  it("never schedules into the past", () => {
    const { ctx, clock, played, run, start } = setup()

    start({ scene: "lamps" }, clock.now() - 100)
    run(4000)

    expect(played.length).toBeGreaterThan(0)
    expect(played.every((entry) => entry.when >= 0)).toBe(true)
    expect(ctx.currentTime).toBeGreaterThan(3.9)
  })

  it("lands the drop on the unlock and the ticks on the last five seconds", () => {
    const { clock, played, run, start } = setup()
    const origin = clock.now()

    // Answering opens in 12 s; the room has 14 s.
    start(answers(12_000), origin + 12_000)
    run(27_000)

    const impact = of(played, "impact")
    const ticks = of(played, "tick")

    expect(impact).toHaveLength(1)
    expect(impact[0].when).toBeCloseTo(12, 1)
    expect(ticks.map((entry) => Math.round(entry.when))).toEqual([
      21, 22, 23, 24, 25,
    ])
  })
})

describe("late starts", () => {
  it("skips what is already past and joins the bed mid-bar without a hit", () => {
    const { clock, played, run, start } = setup()

    // Joined 5 s after the unlock: the drop is long gone.
    start(answers(0), clock.now() - 5000)
    run(100)

    expect(of(played, "impact")).toEqual([])
    expect(of(played, "crash")).toEqual([])
    expect(of(played, "chord")).toEqual([])
    expect(of(played, "riser")).toEqual([])
    // But the groove is playing: nothing earlier than the join, everything after.
    expect(played.length).toBeGreaterThan(0)

    for (const entry of played) {
      expect(entry.event.t).toBeGreaterThanOrEqual(5 - 0.12 - 1e-9)
    }
  })

  it("does not replay the earlier slots when joining during power-on", () => {
    const { clock, played, run, start } = setup()

    // 9 s into a 12 s power-on: slots A, B and C are past, D (at +10) is not.
    start(answers(3000), clock.now() + 3000)
    run(50)

    expect(of(played, "clunk")).toEqual([])
    run(1500)
    expect(of(played, "clunk")).toHaveLength(1)
  })

  it("still plays a hit that is only a little late: the screen is late too", () => {
    const { clock, played, run, start } = setup()

    start(answers(0), clock.now() - 300)
    run(50)

    expect(of(played, "impact")).toHaveLength(1)
    expect(300 / 1000).toBeLessThan(MAX_LATE_S)
  })

  it("drops that same hit once it is more than the tolerance late", () => {
    const { clock, played, run, start } = setup()

    start(answers(0), clock.now() - 800)
    run(50)

    expect(of(played, "impact")).toEqual([])
  })

  it("plays nothing from a scene that is entirely over", () => {
    const { clock, played, engine, run, start } = setup()

    start(answers(0, 14), clock.now() - 60_000)
    run(200)

    expect(played).toEqual([])
    expect(engine.hasWork()).toBe(false)
  })
})

describe("clock drift and sleep", () => {
  it("measures the clock pair again when the context sleeps and wakes", () => {
    const { ctx, clock, played, engine, start } = setup()

    start({ scene: "leaderboard" }, clock.now())
    engine.pump()
    played.length = 0

    // The tab slept for 5 s: wall time moved, the audio clock did not.
    clock.advance(5000)
    engine.pump()

    expect(played.length).toBeGreaterThan(0)
    expect(DRIFT_S).toBeLessThan(0.1)

    for (const entry of played) {
      // Scheduled relative to where the audio clock now is, never 5 s ahead or behind.
      expect(entry.when).toBeGreaterThanOrEqual(ctx.currentTime)
      expect(entry.when).toBeLessThan(ctx.currentTime + 0.5)
      // And nothing from the missed 5 s was replayed.
      expect(entry.event.t).toBeGreaterThanOrEqual(5 - MAX_LATE_S)
    }
  })

  it("keeps a steady grid when the clocks agree", () => {
    const { ctx, clock, played, engine, run, start } = setup()

    ctx.currentTime = 100
    start({ scene: "lobby" }, clock.now())
    engine.pump()
    run(4000)

    const pads = of(played, "pad").map((entry) => entry.when)

    // One pad a bar, 2 s apart, to the millisecond.
    expect(pads.length).toBeGreaterThanOrEqual(2)

    for (const [index, when] of pads.entries()) {
      if (index > 0) {
        expect(when - pads[index - 1]).toBeCloseTo(2, 3)
      }
    }
  })
})

describe("lanes", () => {
  it("does not start the same live scene twice", () => {
    const { clock, played, run, start } = setup()

    expect(start({ scene: "lobby" }, clock.now())).toEqual([true])
    expect(start({ scene: "lobby" }, clock.now())).toEqual([false])
    run(500)

    const lobbyStarts = of(played, "pad").length

    expect(lobbyStarts).toBe(1)
  })

  it("starts it again once it has ended", () => {
    const { clock, run, start } = setup()

    start({ scene: "roundCard" }, clock.now())
    run(2000)

    expect(start({ scene: "roundCard" }, clock.now())).toEqual([true])
  })

  it("a new scene replaces its lane: the old one stops scheduling and fades", () => {
    const { clock, played, run, start } = setup()

    start({ scene: "lobby" }, clock.now())
    run(500)

    const lobbyBus = played[0].bus

    start(
      {
        scene: "reading",
        chargeAt: clock.now() + 6000,
        chargeMs: 5000,
        serverNow: clock.now(),
      },
      clock.now() + 6000,
    )

    const before = played.filter((entry) => entry.bus === lobbyBus).length

    run(8000)

    expect(played.filter((entry) => entry.bus === lobbyBus)).toHaveLength(
      before,
    )
    expect(gainCalls(lobbyBus, "setTargetAtTime").length).toBeGreaterThan(0)
    // The new scene has its own bus.
    expect(played.some((entry) => entry.bus !== lobbyBus)).toBe(true)
  })

  it("a verdict scene cuts the groove still running in the bed lane", () => {
    const { clock, played, run, start } = setup()

    start(answers(0), clock.now())
    run(2000)

    const bedBus = played[0].bus

    // Everyone answered early: TIME arrives 2 s into a 14 s question.
    start(
      { scene: "time", resultsAt: clock.now(), serverNow: clock.now() },
      clock.now(),
    )
    run(1000)

    expect(gainCalls(bedBus, "setTargetAtTime").length).toBeGreaterThan(0)
    expect(
      played.filter((entry) => entry.bus === bedBus && entry.event.t > 2.5),
    ).toEqual([])
  })

  it("lets a groove that already ended keep its tail when TIME arrives", () => {
    const { clock, played, run, start } = setup()

    start(answers(0, 3), clock.now())
    run(4000)

    const bedBus = played[0].bus

    start(
      { scene: "time", resultsAt: clock.now(), serverNow: clock.now() },
      clock.now(),
    )

    expect(gainCalls(bedBus, "setTargetAtTime")).toEqual([])
  })

  it("lets a verdict phase ring on when the next one replaces it", () => {
    const { clock, played, run, start } = setup()
    const stamps = { resultsAt: clock.now(), serverNow: clock.now() }

    start({ scene: "time", ...stamps }, clock.now())
    run(100)

    const timeBus = played[0].bus

    start({ scene: "count", ...stamps, votes: [3, 8, 4, 2] }, clock.now())
    run(3000)

    // No fade on the TIME hit: it was replaced, not cut.
    expect(gainCalls(timeBus, "setTargetAtTime")).toEqual([])
  })

  it("stop(lane) fades that lane and leaves the others", () => {
    const { clock, played, engine, run, start } = setup()

    start({ scene: "lobby" }, clock.now())
    start({ scene: "roundCard" }, clock.now())
    run(200)

    const lobbyBus = played.find((entry) => entry.event.inst === "pad")?.bus

    engine.stop("bed", 0.3)

    expect(
      lobbyBus && gainCalls(lobbyBus, "setTargetAtTime").length,
    ).toBeGreaterThan(0)
    expect(engine.live()).toEqual({ show: expect.any(String) as string })

    const count = played.length

    run(1000)

    expect(played.slice(count).every((entry) => entry.bus !== lobbyBus)).toBe(
      true,
    )
  })

  it("stop() silences every lane and the cues", () => {
    const { clock, played, engine, run, start } = setup()

    start({ scene: "lobby" }, clock.now())
    engine.cue([{ t: 0, inst: "pluck", p: { m: 69 } }])
    run(100)
    engine.stop()

    expect(engine.live()).toEqual({})
    expect(engine.hasWork()).toBe(false)

    const count = played.length

    run(1000)
    expect(played).toHaveLength(count)
  })

  it("takes a faded bus out of the graph once its tail is over", () => {
    const { clock, played, engine, run, start } = setup()

    start({ scene: "lobby" }, clock.now())
    run(200)

    const [{ bus }] = played

    engine.stop("bed", 0.3)
    expect((bus.dry as unknown as FakeNode).disconnected).toBe(0)

    clock.advance(10_000)

    expect((bus.dry as unknown as FakeNode).disconnected).toBeGreaterThan(0)
  })
})

describe("pump and work", () => {
  it("has no work when nothing is playing", () => {
    const { engine } = setup()

    expect(engine.hasWork()).toBe(false)
    expect(engine.pump()).toBe(false)
  })

  it("has work while a bed loops and none once a one-shot scene is done", () => {
    const { clock, engine, run, start } = setup()

    start({ scene: "lobby" }, clock.now())
    expect(engine.pump()).toBe(true)
    run(60_000)
    expect(engine.hasWork()).toBe(true)

    engine.stop()
    start({ scene: "roundCard" }, clock.now())
    run(2000)
    expect(engine.hasWork()).toBe(false)
  })
})

describe("levels and cues", () => {
  it("trims a lane's bus by the level the controller asks for", () => {
    const { clock, played, run, start } = setup((lane) =>
      lane === "bed" ? -12 : 0,
    )

    start({ scene: "lobby" }, clock.now())
    start({ scene: "roundCard" }, clock.now())
    run(200)

    const bed = played.find((entry) => entry.event.inst === "pad")

    const dry = bed?.bus.dry as unknown as FakeNode | undefined

    expect(dry?.gain.value).toBeCloseTo(10 ** (-12 / 20), 5)
  })

  it("plays a cue right now, a hair ahead, on its own bus", () => {
    const { ctx, played, engine } = setup()

    ctx.currentTime = 3

    engine.cue([
      { t: 0, inst: "flap", p: { n: 6 } },
      { t: 0.02, inst: "pluck", p: { m: 72 } },
    ])

    expect(played.map((entry) => entry.when)).toEqual([3.01, 3.03])
    expect(played[0].bus).toBe(played[1].bus)
  })
})
