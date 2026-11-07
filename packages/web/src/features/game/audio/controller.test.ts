import { NO_TIME_LIMIT } from "@razzia/common/constants"
import {
  type ControllerDeps,
  createScore,
  type HowlerLike,
  RELEASE_AFTER_IDLE_MS,
  type SoundState,
} from "@razzia/web/features/game/audio/controller"
import type { Engine, EngineDeps } from "@razzia/web/features/game/audio/engine"
import type {
  LegacyPlan,
  LegacyRunner,
} from "@razzia/web/features/game/audio/legacy"
import type { Scene } from "@razzia/web/features/game/audio/music"
import type { SceneSpec } from "@razzia/web/features/game/audio/scenes"
import {
  type FakeAudioContext,
  fakeContext,
  fakeNode,
  type ManualClock,
  manualClock,
} from "@razzia/web/features/game/audio/test-support"
import { describe, expect, it, vi } from "vitest"

const LOBBY: SceneSpec = { scene: "lobby" }

type AnswersSpec = Extract<SceneSpec, { scene: "answers" }>

const answers = (clock: ManualClock, unlockInMs: number): AnswersSpec => ({
  scene: "answers",
  revealStartedAt: clock.time - 100,
  unlockAt: clock.time + unlockInMs,
  serverNow: clock.time - 100,
  answers: 4,
  time: 14,
})

const fakeEngine = (hasWork = true) => {
  const engine = {
    start: vi.fn((_scene: Scene, _originMs: number) => true),
    cue: vi.fn(),
    pump: vi.fn(() => hasWork),
    hasWork: vi.fn(() => hasWork),
    stop: vi.fn(),
    live: vi.fn(() => ({})),
    dispose: vi.fn(),
  }

  return engine satisfies Engine
}

const setup = (initial: Partial<SoundState> = {}, hasWork = true) => {
  const clock = manualClock()
  const ctx = fakeContext()
  const howler: HowlerLike = {
    ctx: ctx as unknown as AudioContext,
    masterGain: fakeNode("master") as unknown as AudioNode,
    autoSuspend: true,
    _autoSuspend: vi.fn(),
  }
  const state: SoundState = {
    muted: false,
    suppressed: false,
    volume: 1,
    ...initial,
  }
  const listeners = new Set<() => void>()
  const gestures = new EventTarget()
  const engine = fakeEngine(hasWork)
  const engineDeps: EngineDeps[] = []
  const legacy = {
    setTheme: vi.fn(),
    start: vi.fn(),
    cue: vi.fn(),
    stop: vi.fn(),
    unloadAll: vi.fn(),
    loaded: () => [],
  } satisfies LegacyRunner
  const deps: ControllerDeps = {
    howler,
    sound: {
      getState: () => ({ ...state }),
      subscribe: (listener) => {
        listeners.add(listener)

        return () => {
          listeners.delete(listener)
        }
      },
    },
    legacy,
    gestures,
    now: clock.now,
    timers: clock.timers(),
    createEngine: (made) => {
      engineDeps.push(made)

      return engine
    },
  }
  const score = createScore(deps)
  const setSound = (patch: Partial<SoundState>) => {
    Object.assign(state, patch)

    for (const listener of listeners) {
      listener()
    }
  }

  return {
    clock,
    ctx,
    howler,
    engine,
    engineDeps,
    gestures,
    legacy,
    listeners,
    score,
    setSound,
  }
}

describe("without Web Audio", () => {
  it("is a silent no-op when Howler fell back to HTML5 audio", () => {
    const { clock, howler, engine, score } = setup()

    howler.ctx = null
    howler.masterGain = null

    expect(() => {
      score.start(LOBBY)
      score.cue({ cue: "pop", index: 0 })
      score.stop()
      score.dispose()
    }).not.toThrow()

    expect(engine.start).not.toHaveBeenCalled()
    expect(engine.cue).not.toHaveBeenCalled()
    expect(clock.intervals()).toBe(0)
    expect(howler.autoSuspend).toBe(true)
  })

  it("is a no-op when the context was closed", () => {
    const { ctx, engine, score } = setup()

    ctx.state = "closed"
    score.start(LOBBY)

    expect(engine.start).not.toHaveBeenCalled()
  })
})

describe("muted, suppressed and silent", () => {
  it.each([
    ["muted", { muted: true }],
    ["suppressed by the deck", { suppressed: true }],
    ["at zero volume", { volume: 0 }],
  ] as const)("schedules nothing and runs no pump while %s", (_name, sound) => {
    const { clock, howler, engine, score } = setup(sound)

    score.start(LOBBY)
    score.start({ scene: "title" })
    score.cue({ cue: "pop", index: 0 })
    clock.advance(10_000)

    expect(engine.start).not.toHaveBeenCalled()
    expect(engine.pump).not.toHaveBeenCalled()
    expect(engine.cue).not.toHaveBeenCalled()
    expect(clock.intervals()).toBe(0)
    expect(howler.autoSuspend).toBe(true)
  })

  it("never creates a voice on a real graph while muted", () => {
    const { clock, ctx, score } = setup({ muted: true })
    // No fake engine: a real one on the fake context would start voices.
    const real = createScore({
      howler: {
        ctx: ctx as unknown as AudioContext,
        masterGain: fakeNode("master") as unknown as AudioNode,
        autoSuspend: true,
      },
      sound: {
        getState: () => ({ muted: true, suppressed: false, volume: 1 }),
        subscribe: () => () => undefined,
      },
      legacy: {
        setTheme: vi.fn(),
        start: vi.fn(),
        cue: vi.fn(),
        stop: vi.fn(),
        unloadAll: vi.fn(),
        loaded: () => [],
      },
      now: clock.now,
      timers: clock.timers(),
    })

    real.start(LOBBY)
    real.cue({ cue: "pop", index: 0 })
    clock.advance(5000)

    expect(ctx.voicesStarted()).toBe(0)
    // Not even the graph is built until there is something to hear.
    expect(ctx.nodes).toHaveLength(0)
    expect(score.debug().pumping).toBe(false)
  })

  it("is silent when intensity is silent, and stops what was playing", () => {
    const { clock, engine, score } = setup()

    score.start(LOBBY)
    expect(clock.intervals()).toBe(1)

    score.configure({ intensity: "silent", theme: "show", surface: "host" })

    expect(engine.stop).toHaveBeenCalled()
    expect(clock.intervals()).toBe(0)

    const starts = engine.start.mock.calls.length

    score.start({ scene: "title" })
    score.cue({ cue: "pop", index: 0 })

    expect(engine.start).toHaveBeenCalledTimes(starts)
    expect(engine.cue).not.toHaveBeenCalled()
  })

  it("stops the pump when the page is muted mid-scene", () => {
    const { clock, score, setSound } = setup()

    score.start(LOBBY)
    expect(clock.intervals()).toBe(1)

    setSound({ muted: true })

    expect(clock.intervals()).toBe(0)
  })

  it("picks the bed back up mid-bar when unmuted, without replaying the start", () => {
    const { clock, engine, score, setSound } = setup({ muted: true })
    const startedAt = clock.time

    score.start(LOBBY)
    clock.advance(6000)
    expect(engine.start).not.toHaveBeenCalled()

    setSound({ muted: false })

    expect(engine.start).toHaveBeenCalledTimes(1)
    // Anchored where the scene began, so the engine joins it 6 s in.
    expect(engine.start.mock.calls[0][1]).toBe(startedAt)
    expect(clock.intervals()).toBe(1)
  })

  it("does not wake a scene that already ended while it was muted", () => {
    const { clock, engine, score, setSound } = setup({ muted: true })

    score.start({ scene: "roundCard" })
    clock.advance(10_000)
    setSound({ muted: false })

    expect(engine.start).not.toHaveBeenCalled()
  })
})

describe("starting scenes", () => {
  it("starts a scene offsetMs after it logically began", () => {
    const { clock, engine, score } = setup()

    score.start(LOBBY, { offsetMs: 7000 })

    expect(engine.start.mock.calls[0][1]).toBe(clock.time - 7000)
  })

  it("anchors a stamped scene by its stamp, not its arrival", () => {
    const { clock, engine, score } = setup()

    // Unlock in 4 s, however far the server's clock is from this one.
    score.start(answers(clock, 4000))

    // The server sent it 100 ms before the unlock-to-be 4 s from now: 4.1 s.
    expect(engine.start.mock.calls[0][1]).toBe(clock.time + 4100)
  })

  it("starts the same live scene once, however often the screen re-renders", () => {
    const { clock, engine, score } = setup()
    const spec = answers(clock, 4000)

    score.start(spec)
    score.start({ ...spec })
    score.start({ ...spec })

    expect(engine.start).toHaveBeenCalledTimes(1)
  })

  it("a reviewed screen starts silently and neither plays nor cuts anything", () => {
    const { engine, score } = setup()

    score.start(LOBBY)
    score.start(
      { scene: "reading", chargeAt: 1, chargeMs: 5000, serverNow: 0 },
      { silent: true },
    )
    score.start({ scene: "time", resultsAt: 1, serverNow: 0 }, { silent: true })
    score.cue({ cue: "pop", index: 0 }, { silent: true })

    expect(engine.start).toHaveBeenCalledTimes(1)
    expect(engine.stop).not.toHaveBeenCalled()
    expect(engine.cue).not.toHaveBeenCalled()
    expect(score.debug().live).toEqual({ bed: expect.any(String) as string })
  })

  it("remembers the round, and raises the score for it", () => {
    const { clock, engine, score } = setup()

    score.setRound(4, 6)
    expect(score.debug()).toMatchObject({ rise: 3, final: false })

    score.start(answers(clock, 4000))

    const [[scene]] = engine.start.mock.calls
    const notes = scene
      .events(0, 1)
      .flatMap((event) => ("m" in event.p ? [event.p.m] : []))

    // The drop's chord and the groove, three semitones up from round one.
    score.setRound(1, 6)
    score.start({ ...answers(clock, 9000), unlockAt: clock.time + 9000 })

    const [, [first]] = engine.start.mock.calls
    const baseNotes = first
      .events(0, 1)
      .flatMap((event) => ("m" in event.p ? [event.p.m] : []))

    expect(notes.length).toBeGreaterThan(0)
    expect(notes.map((note) => note - 3)).toEqual(baseNotes)
    score.setRound(6, 6)
    expect(score.debug().final).toBe(true)
  })

  it("trims the music by 12 dB in calm and nothing else", () => {
    const { engineDeps, score } = setup()

    score.start(LOBBY)
    expect(engineDeps[0].levelDb?.("bed")).toBe(0)

    score.configure({ intensity: "calm", theme: "show", surface: "host" })
    score.start({ scene: "roundCard" })

    expect(engineDeps[0].levelDb?.("bed")).toBe(-12)
    expect(engineDeps[0].levelDb?.("show")).toBe(0)
    expect(engineDeps[0].levelDb?.("cue")).toBe(0)
  })

  it("puts a live scene back on its own anchor when the setting changes", () => {
    const { clock, engine, score } = setup()

    score.start(LOBBY, { offsetMs: 3000 })
    clock.advance(1000)
    score.configure({ intensity: "calm", theme: "show", surface: "host" })

    const { calls } = engine.start.mock

    expect(calls).toHaveLength(2)
    expect(calls[1][1]).toBe(calls[0][1])
  })

  it("rebuilds its graph when Howler replaces its context", () => {
    const { clock, howler, engine, engineDeps, score } = setup()

    score.start(LOBBY)
    expect(engineDeps).toHaveLength(1)

    howler.ctx = fakeContext() as unknown as AudioContext
    score.start({ scene: "roundCard" })

    expect(engineDeps).toHaveLength(2)
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    expect(clock.intervals()).toBe(1)
  })
})

describe("cues", () => {
  it("plays one now, when audible and the context is running", () => {
    const { engine, score } = setup()

    score.cue({ cue: "pop", index: 2 })

    expect(engine.cue).toHaveBeenCalledTimes(1)
  })

  it("drops one that arrives long after it was due", () => {
    const { engine, score } = setup()

    score.cue({ cue: "pop", index: 2 }, { offsetMs: 2000 })

    expect(engine.cue).not.toHaveBeenCalled()
  })

  it("is dropped, and the context woken, while the context sleeps", () => {
    const { ctx, engine, score } = setup()

    ctx.state = "suspended"
    score.cue({ cue: "pop", index: 2 })

    expect(engine.cue).not.toHaveBeenCalled()
    expect(ctx.resumed).toBeGreaterThan(0)
  })
})

describe("the pump", () => {
  it("runs every 25 ms while something plays, and stops when nothing does", () => {
    const { clock, engine, score } = setup({}, false)

    score.start({ scene: "roundCard" })
    expect(clock.intervals()).toBe(1)

    clock.advance(25)

    expect(engine.pump).toHaveBeenCalled()
    expect(clock.intervals()).toBe(0)
  })

  it("waits for a sleeping context and asks it to wake", () => {
    const { clock, ctx, engine, score } = setup()

    ctx.state = "suspended"
    // A browser keeps the context asleep until a gesture; the fake would wake at once.
    ctx.resume = () => {
      ctx.resumed += 1

      return Promise.resolve()
    }
    score.start(LOBBY)
    engine.pump.mockClear()
    clock.advance(500)

    expect(engine.pump).not.toHaveBeenCalled()
    expect(ctx.resumed).toBeGreaterThan(0)
  })

  it("resumes pumping when the context wakes", () => {
    const { clock, ctx, engine, score } = setup()

    ctx.state = "suspended"
    score.start(LOBBY)
    engine.pump.mockClear()
    ctx.state = "running"
    clock.advance(100)

    expect(engine.pump).toHaveBeenCalled()
  })
})

describe("unlocking on a gesture (iOS)", () => {
  // WebKit resumes a context only inside a gesture until it has run once.
  const asleep = (ctx: FakeAudioContext) => {
    ctx.state = "suspended"
    ctx.resume = () => {
      ctx.resumed += 1

      return Promise.resolve()
    }
  }

  const settle = () =>
    new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

  it("resumes the context inside the first gesture, then stops listening", async () => {
    const { ctx, gestures } = setup()

    ctx.state = "suspended"
    gestures.dispatchEvent(new Event("pointerdown"))

    expect(ctx.resumed).toBe(1)
    await settle()

    // Running now; a later interruption is the pump's to wake.
    ctx.state = "suspended"
    gestures.dispatchEvent(new Event("pointerdown"))

    expect(ctx.resumed).toBe(1)
  })

  it("listens for a touch, a key and a pointer until the context runs", async () => {
    const { ctx, gestures } = setup()

    asleep(ctx)

    for (const type of ["touchend", "keydown", "pointerdown"]) {
      gestures.dispatchEvent(new Event(type))
    }

    await settle()
    expect(ctx.resumed).toBe(3)
  })

  it("stops listening when the score is disposed", () => {
    const { ctx, gestures, score } = setup()

    asleep(ctx)
    score.dispose()
    gestures.dispatchEvent(new Event("pointerdown"))

    expect(ctx.resumed).toBe(0)
  })
})

describe("Howler's auto-suspend", () => {
  it("is switched off while a scene plays, and put back when everything stops", () => {
    const { howler, score } = setup()

    score.start(LOBBY)

    expect(howler.autoSuspend).toBe(false)
    expect(score.debug().holdingAutoSuspend).toBe(true)

    score.stop()

    expect(howler.autoSuspend).toBe(true)
    expect(howler._autoSuspend).toHaveBeenCalledTimes(1)
    expect(score.debug().holdingAutoSuspend).toBe(false)
  })

  it("holds across a pause between scenes and releases after a quiet spell", () => {
    const { clock, howler, score } = setup({}, false)

    score.start({ scene: "roundCard" })
    clock.advance(25)
    expect(clock.intervals()).toBe(0)
    expect(howler.autoSuspend).toBe(false)

    clock.advance(RELEASE_AFTER_IDLE_MS - 1000)
    expect(howler.autoSuspend).toBe(false)

    clock.advance(2000)
    expect(howler.autoSuspend).toBe(true)
    expect(howler._autoSuspend).toHaveBeenCalledTimes(1)
  })

  it("a new scene during the quiet spell cancels the release", () => {
    const { clock, howler, score } = setup({}, false)

    score.start({ scene: "roundCard" })
    clock.advance(25)
    clock.advance(RELEASE_AFTER_IDLE_MS - 1000)
    score.start({ scene: "lamps" })
    clock.advance(25)
    clock.advance(RELEASE_AFTER_IDLE_MS - 1000)

    expect(howler.autoSuspend).toBe(false)
  })

  it("puts back whatever value Howler had, even false", () => {
    const { howler, score } = setup()

    howler.autoSuspend = false
    score.start(LOBBY)
    score.stop()

    expect(howler.autoSuspend).toBe(false)
  })

  it("is restored by dispose", () => {
    const { howler, listeners, score } = setup()

    score.start(LOBBY)
    score.dispose()

    expect(howler.autoSuspend).toBe(true)
    expect(listeners.size).toBe(0)
  })

  it("is not touched at all while muted", () => {
    const { howler, score } = setup({ muted: true })

    score.start(LOBBY)

    expect(howler.autoSuspend).toBe(true)
  })
})

describe("stopping", () => {
  it("stops one lane, or everything", () => {
    const { clock, engine, legacy, score } = setup()

    score.start(LOBBY)
    score.start({ scene: "roundCard" })
    score.stop("bed", 0.5)

    expect(engine.stop).toHaveBeenLastCalledWith("bed", 0.5)
    expect(legacy.stop).toHaveBeenLastCalledWith("bed")
    expect(score.debug().live).toEqual({ show: "roundCard" })

    score.stop()

    expect(engine.stop).toHaveBeenLastCalledWith(undefined, 0.3)
    expect(score.debug().live).toEqual({})
    expect(clock.intervals()).toBe(0)
  })
})

describe("the legacy packs", () => {
  it("plays through the legacy adapter, never the engine", () => {
    const { engine, legacy, score } = setup()

    score.configure({ intensity: "full", theme: "techno", surface: "host" })
    score.start({
      scene: "reading",
      chargeAt: 1000,
      chargeMs: 5000,
      serverNow: 0,
    })
    score.cue({ cue: "pop", index: 0 })

    expect(legacy.setTheme).toHaveBeenCalledWith("techno")
    expect(legacy.start).toHaveBeenCalledTimes(1)
    expect(legacy.cue).toHaveBeenCalledTimes(1)
    expect(engine.start).not.toHaveBeenCalled()
    expect(engine.cue).not.toHaveBeenCalled()
  })

  it("never touches the legacy adapter while muted: no Howl can be created", () => {
    const { legacy, score } = setup({ muted: true })

    score.configure({ intensity: "full", theme: "classic", surface: "player" })
    score.start({
      scene: "reading",
      chargeAt: 1000,
      chargeMs: 5000,
      serverNow: 0,
    })
    score.cue({ cue: "pop", index: 0 })

    expect(legacy.start).not.toHaveBeenCalled()
    expect(legacy.cue).not.toHaveBeenCalled()
  })

  it("unloads every Howl when the page goes quiet", () => {
    const { legacy, score, setSound } = setup()

    score.configure({ intensity: "full", theme: "classic", surface: "host" })
    score.start({
      scene: "reading",
      chargeAt: 1000,
      chargeMs: 5000,
      serverNow: 0,
    })
    legacy.unloadAll.mockClear()
    setSound({ suppressed: true })

    expect(legacy.unloadAll).toHaveBeenCalled()
  })

  it("unloads the old pack when the theme changes", () => {
    const { legacy, score } = setup()

    score.configure({ intensity: "full", theme: "classic", surface: "host" })
    score.configure({ intensity: "full", theme: "techno", surface: "host" })

    expect(legacy.unloadAll).toHaveBeenCalled()
    expect(legacy.setTheme).toHaveBeenLastCalledWith("techno")
  })

  describe("an untimed question's music", () => {
    const untimed = (clock: ManualClock): AnswersSpec => ({
      ...answers(clock, 0),
      time: NO_TIME_LIMIT,
    })

    it("comes back after a mute and an unmute", () => {
      const { clock, legacy, score, setSound } = setup()

      score.configure({ intensity: "full", theme: "classic", surface: "host" })
      score.start(untimed(clock))
      clock.advance(5000)
      setSound({ muted: true })
      setSound({ muted: false })

      expect(legacy.start).toHaveBeenCalledTimes(2)
      expect(legacy.start.mock.calls[1][0]).toMatchObject({ lane: "bed" })
    })

    it("comes back after an intensity change", () => {
      const { clock, legacy, score } = setup()

      score.configure({ intensity: "full", theme: "techno", surface: "host" })
      score.start(untimed(clock))
      clock.advance(5000)
      score.configure({ intensity: "calm", theme: "techno", surface: "host" })

      expect(legacy.start).toHaveBeenCalledTimes(2)
      expect(legacy.start.mock.calls[1][2]).toBe("calm")
    })

    it("is not torn down and restarted when the screen asks again", () => {
      const { clock, legacy, score } = setup()
      const spec = untimed(clock)

      score.configure({ intensity: "full", theme: "classic", surface: "host" })
      score.start(spec)
      clock.advance(5000)
      score.start({ ...spec })

      expect(legacy.start).toHaveBeenCalledTimes(1)
    })
  })

  it("plays the podium's files, and the board's cut, through the old pack", () => {
    const { legacy, score } = setup()

    score.configure({ intensity: "full", theme: "techno", surface: "host" })
    score.start({ scene: "podium", places: 3 })
    score.start({ scene: "leaderboard", rows: 5, overtakes: true })

    const [[podium], [board]] = legacy.start.mock.calls as [
      [LegacyPlan],
      [LegacyPlan],
    ]

    expect(podium.events.map((event) => event.sfx)).toEqual([
      "three",
      "second",
      "roll",
      "first",
    ])
    expect(board.cuts).toEqual(["verdict"])
  })

  it("leaves the engine alone and holds no auto-suspend for the mp3s", () => {
    const { howler, score } = setup()

    score.configure({ intensity: "full", theme: "classic", surface: "host" })
    score.start({ scene: "lamps" })

    expect(howler.autoSuspend).toBe(true)
  })
})
