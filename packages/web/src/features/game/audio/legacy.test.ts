import {
  createLegacyRunner,
  type HowlLike,
  IDLE_UNLOAD_MS,
  legacyCue,
  type LegacyDeps,
  legacyPlan,
  type LegacyOptions,
  type LegacySource,
} from "@razzia/web/features/game/audio/legacy"
import type { SceneSpec } from "@razzia/web/features/game/audio/scenes"
import { manualClock } from "@razzia/web/features/game/audio/test-support"
import { describe, expect, it } from "vitest"

const HOST: LegacyOptions = { intensity: "full", surface: "host" }

const spec = (value: SceneSpec) => value

const answers = (time: number) =>
  spec({
    scene: "answers",
    revealStartedAt: 0,
    unlockAt: 12_000,
    serverNow: 0,
    answers: 4,
    time,
  })

describe("legacyPlan: what the old packs did", () => {
  it("plays the question's sound as the reading screen arrives", () => {
    const plan = legacyPlan(
      spec({ scene: "reading", chargeAt: 1, chargeMs: 5000, serverNow: 0 }),
      null,
      HOST,
    )

    expect(plan?.events).toEqual([{ t: 0, sfx: "show", onStart: true }])
  })

  it("loops the answers bed while answers are open, and ticks the last five seconds", () => {
    const plan = legacyPlan(answers(14), null, HOST)

    expect(plan?.lane).toBe("bed")
    expect(plan?.events[0]).toEqual({ t: 0, sfx: "music", until: 14 })
    expect(plan?.events.slice(1).map((event) => [event.t, event.sfx])).toEqual([
      [9, "tick"],
      [10, "tick"],
      [11, "tick"],
      [12, "tick"],
      [13, "tick"],
    ])
  })

  it("loops without end, or ticks, for an untimed question", () => {
    const plan = legacyPlan(answers(-1), null, HOST)

    expect(plan?.events).toEqual([{ t: 0, sfx: "music", until: undefined }])
  })

  it("plays results at TIME and stops the bed", () => {
    for (const scene of [
      spec({ scene: "time", resultsAt: 1, serverNow: 1 }),
      spec({
        scene: "verdict",
        resultsAt: 1,
        serverNow: 1,
        votes: [1],
        outcome: "right",
      }),
    ]) {
      const plan = legacyPlan(scene, null, HOST)

      expect(plan?.events).toEqual([{ t: 0, sfx: "results" }])
      expect(plan?.cuts).toEqual(["bed"])
    }
  })

  it("stops the answers bed at a phone's strike", () => {
    const plan = legacyPlan(
      spec({ scene: "strike", resultsAt: 1, serverNow: 1, outcome: "right" }),
      null,
      { ...HOST, surface: "player" },
    )

    expect(plan?.cuts).toEqual(["bed"])
    expect(plan?.events).toEqual([])
  })

  it("has the old podium's two-second steps, and goes straight to first with fewer than three", () => {
    const three = legacyPlan(spec({ scene: "podium", places: 3 }), null, HOST)
    const two = legacyPlan(spec({ scene: "podium", places: 2 }), null, HOST)

    expect(three?.events.map((event) => [event.t, event.sfx])).toEqual([
      [2, "three"],
      [4, "second"],
      [6, "roll"],
      [8, "first"],
    ])
    expect(three?.events[2].until).toBe(8)
    expect(two?.events).toEqual([{ t: 0, sfx: "first" }])
  })

  it("has nothing for the new beats, the lobby or the board", () => {
    for (const scene of [
      spec({ scene: "lobby" }),
      spec({ scene: "title" }),
      spec({ scene: "roundCard" }),
      spec({ scene: "count", resultsAt: 1, serverNow: 1, votes: [1] }),
      spec({ scene: "spotlight", resultsAt: 1, serverNow: 1 }),
    ]) {
      expect(legacyPlan(scene, null, HOST)).toBeNull()
    }

    // The board is silent but it still replaces the verdict's lane.
    expect(
      legacyPlan(spec({ scene: "leaderboard" }), null, HOST)?.events,
    ).toEqual([])
  })

  it("is silent when intensity is silent, and a phone skips the host-only beats", () => {
    expect(
      legacyPlan(answers(14), null, { ...HOST, intensity: "silent" }),
    ).toBeNull()
    expect(
      legacyPlan(spec({ scene: "podium", places: 3 }), null, {
        ...HOST,
        surface: "player",
      }),
    ).toBeNull()
    expect(
      legacyPlan(answers(14), null, { ...HOST, surface: "player" }),
    ).not.toBeNull()
  })
})

describe("legacyCue", () => {
  it("maps the cues onto the old files", () => {
    const sfx = (cue: Parameters<typeof legacyCue>[0]) =>
      legacyCue(cue, HOST)?.sfx

    expect(sfx({ cue: "join", index: 3 })).toBe("pop")
    expect(sfx({ cue: "pop", index: 3 })).toBe("pop")
    expect(sfx({ cue: "tick", index: 3 })).toBe("tick")
    expect(sfx({ cue: "lamp", k: 1 })).toBe("tick")
    expect(sfx({ cue: "place", place: 3 })).toBe("three")
    expect(sfx({ cue: "place", place: 2 })).toBe("second")
    expect(sfx({ cue: "place", place: 1 })).toBe("first")
    expect(sfx({ cue: "roll", ms: 4000 })).toBe("roll")
    expect(sfx({ cue: "go" })).toBeUndefined()
    expect(sfx({ cue: "impact" })).toBeUndefined()
  })

  it("keeps the projector's cues off a phone, as the show pack does", () => {
    const phone: LegacyOptions = { ...HOST, surface: "player" }

    expect(legacyCue({ cue: "join", index: 0 }, phone)).toBeNull()
    expect(legacyCue({ cue: "place", place: 1 }, phone)).toBeNull()
    expect(legacyCue({ cue: "roll", ms: 4000 }, phone)).toBeNull()
    expect(legacyCue({ cue: "pop", index: 0 }, phone)?.sfx).toBe("pop")
    expect(legacyCue({ cue: "tick", index: 0 }, phone)?.sfx).toBe("tick")
  })

  it("cuts a roll after its length, and is silent when silent", () => {
    expect(legacyCue({ cue: "roll", ms: 4000 }, HOST)?.until).toBe(4)
    expect(
      legacyCue({ cue: "pop", index: 0 }, { ...HOST, intensity: "silent" }),
    ).toBeNull()
  })
})

interface FakeHowl extends HowlLike {
  source: LegacySource
  loop: boolean
  plays: number
  stops: number
  unloaded: boolean
  playingNow: boolean
}

const setup = () => {
  const clock = manualClock()
  const created: FakeHowl[] = []
  const deps: LegacyDeps = {
    now: clock.now,
    source: (sfx, theme) => ({
      src: `/sounds/${theme}/${sfx}.mp3`,
      volume: 0.2,
    }),
    createHowl: (source, loop) => {
      const howl: FakeHowl = {
        source,
        loop,
        plays: 0,
        stops: 0,
        unloaded: false,
        playingNow: false,
        play: () => {
          howl.plays += 1
          howl.playingNow = true
        },
        stop: () => {
          howl.stops += 1
          howl.playingNow = false
        },
        unload: () => {
          howl.unloaded = true
        },
        playing: () => howl.playingNow,
      }

      created.push(howl)

      return howl
    },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  }

  return { clock, created, runner: createLegacyRunner(deps), deps }
}

const plan = (value: SceneSpec) => {
  const result = legacyPlan(value, null, HOST)

  if (!result) {
    throw new Error("expected a plan")
  }

  return result
}

describe("the legacy runner's Howl lifetime", () => {
  it("creates nothing until something is about to play", () => {
    const { clock, created, runner } = setup()

    runner.start(plan(answers(14)), clock.now() + 5000, "full")
    runner.start(plan(spec({ scene: "lamps" })), clock.now(), "full")

    // Timers are armed, but no Howl exists yet: nothing was preloaded.
    expect(created).toEqual([])
    expect(runner.loaded()).toEqual([])
  })

  it("creates the music Howl when it is time, with the tuned volume, looping", () => {
    const { clock, created, runner } = setup()

    runner.start(plan(answers(14)), clock.now() + 1000, "full")
    clock.advance(999)
    expect(created).toEqual([])

    clock.advance(2)

    expect(created).toHaveLength(1)
    expect(created[0].loop).toBe(true)
    expect(created[0].source).toEqual({
      src: "/sounds/classic/music.mp3",
      volume: 0.2,
    })
    expect(created[0].plays).toBe(1)
  })

  it("plays the question's sound once, on arrival", () => {
    const { clock, created, runner } = setup()

    runner.setTheme("techno")
    runner.start(
      plan(
        spec({
          scene: "reading",
          chargeAt: 999_999,
          chargeMs: 5000,
          serverNow: 0,
        }),
      ),
      clock.now() + 99_999,
      "full",
    )
    clock.advance(1)

    expect(created.map((howl) => howl.source.src)).toEqual([
      "/sounds/techno/show.mp3",
    ])
    expect(created[0].plays).toBe(1)
  })

  it("joins the bed late rather than skipping it, but never replays what is past", () => {
    const { clock, created, runner } = setup()

    // The bed began 5 s ago with 9 s left: it starts at once.
    runner.start(plan(answers(14)), clock.now() - 5000, "full")
    clock.advance(1)

    expect(created.filter((howl) => howl.loop)).toHaveLength(1)

    // A tick whose second has gone by is not played late (but music loops stay).
    expect(created.filter((howl) => !howl.loop)).toHaveLength(0)
  })

  it("skips a bed that has already ended", () => {
    const { clock, created, runner } = setup()

    runner.start(plan(answers(14)), clock.now() - 20_000, "full")
    clock.advance(100)

    expect(created).toEqual([])
  })

  it("stops and unloads the bed when its scene ends", () => {
    const { clock, created, runner } = setup()

    runner.start(plan(answers(3)), clock.now(), "full")
    clock.advance(10)
    expect(created[0].playingNow).toBe(true)

    clock.advance(3000)

    expect(created[0].stops).toBeGreaterThan(0)
    expect(created[0].unloaded).toBe(true)
    // The big file is gone; the little tick may stay until the idle sweep.
    expect(runner.loaded().filter((key) => key.includes("music"))).toEqual([])
  })

  it("stops the bed when the next scene cuts its lane", () => {
    const { clock, created, runner } = setup()

    runner.start(plan(answers(14)), clock.now(), "full")
    clock.advance(10)
    runner.start(
      plan(spec({ scene: "time", resultsAt: 1, serverNow: 0 })),
      clock.now(),
      "full",
    )
    clock.advance(10)

    const music = created.find((howl) => howl.loop)

    expect(music?.unloaded).toBe(true)
    expect(
      created.some(
        (howl) => howl.source.src.endsWith("results.mp3") && howl.plays === 1,
      ),
    ).toBe(true)
  })

  it("trims the music 12 dB in calm", () => {
    const { clock, created, runner } = setup()

    runner.start(plan(answers(14)), clock.now(), "calm")
    clock.advance(10)

    expect(created[0].source.volume).toBeCloseTo(0.2 * 10 ** (-12 / 20), 5)
  })

  it("reuses a Howl for repeated one-shots instead of loading again", () => {
    const { created, runner } = setup()

    for (const index of [0, 1, 2]) {
      const event = legacyCue({ cue: "pop", index }, HOST)

      if (event) {
        runner.cue(event, "full")
      }
    }

    expect(created).toHaveLength(1)
    expect(created[0].plays).toBe(3)
  })

  it("unloads everything idle after a quiet spell", () => {
    const { clock, created, runner } = setup()
    const event = legacyCue({ cue: "pop", index: 0 }, HOST)

    if (event) {
      runner.cue(event, "full")
    }

    created[0].playingNow = false
    clock.advance(IDLE_UNLOAD_MS + 1)

    expect(created[0].unloaded).toBe(true)
    expect(runner.loaded()).toEqual([])
  })

  it("keeps a sound that is still playing when the idle sweep runs", () => {
    const { clock, created, runner } = setup()

    runner.start(plan(answers(60)), clock.now(), "full")
    clock.advance(IDLE_UNLOAD_MS + 1000)

    expect(created[0].unloaded).toBe(false)
  })

  it("unloads everything, and cancels what was queued, when the pack changes", () => {
    const { clock, created, runner } = setup()

    runner.start(plan(answers(14)), clock.now(), "full")
    clock.advance(10)
    runner.start(plan(spec({ scene: "lamps" })), clock.now() + 500, "full")
    runner.setTheme("techno")

    expect(created[0].unloaded).toBe(true)

    clock.advance(5000)

    // The lamps queued under the old pack never fire.
    expect(created).toHaveLength(1)
    expect(runner.loaded()).toEqual([])
  })

  it("unloadAll is what the controller calls when the page goes quiet", () => {
    const { clock, created, runner } = setup()

    runner.start(plan(answers(14)), clock.now(), "full")
    clock.advance(10)
    runner.unloadAll()
    clock.advance(60_000)

    expect(created.every((howl) => howl.unloaded)).toBe(true)
    expect(clock.pending()).toBe(0)
  })

  it("stopping a lane never loads anything", () => {
    const { clock, created, runner } = setup()

    runner.stop("show")
    runner.stop()
    clock.advance(1000)

    expect(created).toEqual([])
  })

  it("plays the podium on its two-second steps and cuts the roll at first", () => {
    const { clock, created, runner } = setup()

    runner.start(
      plan(spec({ scene: "podium", places: 3 })),
      clock.now(),
      "full",
    )
    clock.advance(2100)
    expect(created.map((howl) => howl.source.src)).toEqual([
      "/sounds/classic/three.mp3",
    ])
    clock.advance(2000)
    clock.advance(2000)

    const roll = created.find((howl) => howl.source.src.endsWith("roll.mp3"))

    expect(roll?.plays).toBe(1)

    clock.advance(2000)

    expect(roll?.stops).toBeGreaterThan(0)
    expect(created.some((howl) => howl.source.src.endsWith("first.mp3"))).toBe(
      true,
    )
  })
})
