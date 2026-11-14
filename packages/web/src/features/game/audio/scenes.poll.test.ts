import { legacyCue } from "@razzia/web/features/game/audio/legacy"
import { PENT } from "@razzia/web/features/game/audio/music"
import {
  type CompileOptions,
  compileCue,
  HOST_ONLY_CUES,
  POLL_CUES,
} from "@razzia/web/features/game/audio/scenes"
import { describe, expect, it } from "vitest"

// A poll's arrivals on the host's screen: a vote rings a step higher for each
// share of the room, and the heartbeat is a soft lub-dub.

const FULL: CompileOptions = {
  intensity: "full",
  surface: "host",
  rise: 0,
  final: false,
}

const plucks = (share: number) =>
  compileCue({ cue: "vote", share }, FULL).flatMap((event) =>
    event.inst === "pluck" ? [event.p.m] : [],
  )

const kicks = (strength: number, options: CompileOptions = FULL) =>
  compileCue({ cue: "beat", strength }, options).flatMap((event) =>
    event.inst === "kick" ? [{ t: event.t, v: event.p.v ?? 1 }] : [],
  )

describe("poll cues", () => {
  it("ring a vote as two plucks a fifth apart, climbing with the room", () => {
    expect(plucks(0)).toEqual([PENT[0], PENT[0] + 7])
    expect(plucks(1)).toEqual([PENT.at(-1), (PENT.at(-1) ?? 0) + 7])
    expect(plucks(0.5)[0]).toBeGreaterThan(plucks(0.2)[0])
    // A share past the ends stays on the scale.
    expect(plucks(3)).toEqual(plucks(1))
    expect(plucks(-1)).toEqual(plucks(0))
  })

  it("beat twice, the second softer, and harder as the room fills", () => {
    const soft = kicks(0.5)
    const hard = kicks(1)

    expect(soft.map(({ t }) => t)).toEqual([0, 0.17])
    expect(soft[1].v).toBeLessThan(soft[0].v)
    expect(hard[0].v).toBeGreaterThan(soft[0].v)
  })

  it("beat at half strength in calm, and not at all when silent", () => {
    const calm = kicks(1, { ...FULL, intensity: "calm" })

    expect(calm[0].v).toBeCloseTo(kicks(1)[0].v / 2)
    expect(
      compileCue(
        { cue: "beat", strength: 1 },
        { ...FULL, intensity: "silent" },
      ),
    ).toEqual([])
    expect(
      compileCue({ cue: "vote", share: 1 }, { ...FULL, intensity: "silent" }),
    ).toEqual([])
  })

  it("belong to the host, and are the only cues that play over a held quiz", () => {
    expect([...POLL_CUES].sort()).toEqual(["beat", "vote"])

    for (const cue of POLL_CUES) {
      expect(HOST_ONLY_CUES.has(cue)).toBe(true)
    }

    expect(
      compileCue({ cue: "vote", share: 1 }, { ...FULL, surface: "player" }),
    ).toEqual([])
  })

  it("play a vote as the old packs' pop, and no heartbeat there", () => {
    const options = {
      intensity: "full",
      surface: "host",
      rise: 0,
      final: false,
    } as const

    expect(legacyCue({ cue: "vote", share: 0.5 }, options)).toEqual({
      t: 0,
      sfx: "pop",
      until: undefined,
    })
    expect(legacyCue({ cue: "beat", strength: 1 }, options)).toBeNull()
  })
})
