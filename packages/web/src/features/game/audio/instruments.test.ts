import {
  type Bus,
  createGraph,
  createLaneBus,
  INSTRUMENTS,
  midiHz,
  playEvent,
  S16,
} from "@razzia/web/features/game/audio/instruments"
import {
  asContext,
  type FakeAudioContext,
  type FakeNode,
  fakeContext,
  fakeGraph,
} from "@razzia/web/features/game/audio/test-support"
import { describe, expect, it } from "vitest"

const asNode = (node: unknown) => node as FakeNode

const sources = (ctx: FakeAudioContext) =>
  ctx.nodes.filter(
    (node) => node.kind === "oscillator" || node.kind === "source",
  )

const startTimes = (ctx: FakeAudioContext) =>
  sources(ctx).flatMap((node) => node.started)

describe("the clock", () => {
  it("is one 120 BPM grid: a sixteenth is an eighth of a second", () => {
    expect(S16).toBe(0.125)
    expect(16 * S16).toBe(2)
  })

  it("converts MIDI notes to frequencies", () => {
    expect(midiHz(69)).toBe(440)
    expect(midiHz(81)).toBeCloseTo(880, 8)
    expect(midiHz(57)).toBeCloseTo(220, 8)
  })
})

describe("the mixing graph", () => {
  it("is the prototype's: soft-clipped, compressed, then 0.86 into the destination", () => {
    const ctx = fakeContext()
    const destination = ctx.destination as unknown as AudioNode
    const graph = createGraph(asContext(ctx), destination)
    const master = asNode(graph.master)
    const compressor = ctx.nodes.find((node) => node.kind === "compressor")
    const shaper = ctx.nodes.find((node) => node.kind === "shaper")

    expect(master.gain.value).toBe(0.86)
    expect(master.connections).toContain(destination)
    expect(compressor?.threshold.value).toBe(-15)
    expect(compressor?.knee.value).toBe(10)
    expect(compressor?.ratio.value).toBe(3.5)
    expect(compressor?.attack.value).toBe(0.004)
    expect(compressor?.release.value).toBe(0.13)
    expect(shaper?.oversample).toBe("2x")
    expect(shaper?.curve).toHaveLength(2049)
  })

  it("has a 2.6 s stereo reverb, a dotted-eighth delay and the bed and drum buses", () => {
    const ctx = fakeContext()
    const graph = fakeGraph(ctx)
    const reverb = asNode(graph.rev).buffer as {
      getChannelData: (c: number) => Float32Array
    }

    expect(reverb.getChannelData(0)).toHaveLength(
      Math.floor(ctx.sampleRate * 2.6),
    )
    expect(asNode(graph.dly).delayTime.value).toBe(0.375)
    expect(asNode(graph.bed).gain.value).toBe(0.74)
    expect(asNode(graph.drum).gain.value).toBe(0.72)
    expect(graph.noise.getChannelData(0)).toHaveLength(ctx.sampleRate * 2)
  })

  it("builds the same graph on any context: no destination hard-wired", () => {
    const ctx = fakeContext()
    const elsewhere = ctx.createGain() as unknown as AudioNode
    const graph = createGraph(asContext(ctx), elsewhere)

    expect(asNode(graph.master).connections).toEqual([elsewhere])
  })
})

describe("the voices", () => {
  it("are the prototype's set, plus the spotlight's swell", () => {
    expect(Object.keys(INSTRUMENTS).sort()).toEqual(
      [
        "kick",
        "clap",
        "hat",
        "bass",
        "pluck",
        "stab",
        "pad",
        "riser",
        "whoosh",
        "impact",
        "clunk",
        "flap",
        "tick",
        "roll",
        "chord",
        "crash",
        "swell",
      ].sort(),
    )
  })

  it("start every source at or after the time they are asked for", () => {
    const events = [
      { t: 0, inst: "kick", p: { v: 1 } },
      { t: 0, inst: "clap", p: {} },
      { t: 0, inst: "hat", p: {} },
      { t: 0, inst: "bass", p: { m: 45, dur: 0.11 } },
      { t: 0, inst: "pluck", p: { m: 69 } },
      { t: 0, inst: "stab", p: { notes: [57, 60], dur: 0.2 } },
      { t: 0, inst: "pad", p: { notes: [57, 60], dur: 2 } },
      { t: 0, inst: "riser", p: { dur: 1 } },
      { t: 0, inst: "whoosh", p: {} },
      { t: 0, inst: "impact", p: {} },
      { t: 0, inst: "clunk", p: { m: 69 } },
      { t: 0, inst: "flap", p: {} },
      { t: 0, inst: "tick", p: { m: 81 } },
      { t: 0, inst: "roll", p: { dur: 1 } },
      { t: 0, inst: "chord", p: { notes: [60, 64] } },
      { t: 0, inst: "crash", p: {} },
      { t: 0, inst: "swell", p: { notes: [33, 45] } },
    ] as const

    for (const event of events) {
      const ctx = fakeContext()
      const bus = fakeGraph(ctx)

      playEvent(bus, event, 5)

      const starts = startTimes(ctx)

      expect(starts.length, event.inst).toBeGreaterThan(0)
      expect(Math.min(...starts), event.inst).toBeGreaterThanOrEqual(5)
      // And every source is stopped, so nothing runs for ever.
      expect(
        sources(ctx).every((node) => node.stopped.length > 0),
        event.inst,
      ).toBe(true)
    }
  })

  it("lets a kick duck the bed bus, and only the bed bus", () => {
    const ctx = fakeContext()
    const bus = fakeGraph(ctx)

    INSTRUMENTS.kick(bus, 2, { v: 1 })

    const { calls } = asNode(bus.duck).gain

    expect(calls.map((call) => call.method)).toEqual([
      "cancelScheduledValues",
      "setValueAtTime",
      "linearRampToValueAtTime",
    ])
    expect(calls[1].args).toEqual([0.55, 2])
    expect(calls[2].args[1]).toBeCloseTo(2.2, 10)
  })

  it("a filtered kick rounds off the pre-drop thump", () => {
    const ctx = fakeContext()

    INSTRUMENTS.kick(fakeGraph(ctx), 0, { v: 0.16, lp: 380 })

    expect(
      ctx.nodes.some(
        (node) => node.kind === "filter" && node.frequency.value === 380,
      ),
    ).toBe(true)
  })

  it("a roll gets faster: its hits come closer together", () => {
    const ctx = fakeContext()

    INSTRUMENTS.roll(fakeGraph(ctx), 0, { dur: 4, v: 1 })

    const hits = startTimes(ctx)
      .filter((time) => time >= 0)
      .sort((a, b) => a - b)
    const unique = [...new Set(hits)]
    const early = unique.filter((time) => time < 1).length
    const late = unique.filter((time) => time >= 3).length

    expect(late).toBeGreaterThan(early)
    expect(Math.max(...unique)).toBeLessThan(4)
  })

  it("a flap seeded by its cue's index does not double another at the same moment", () => {
    const flapAt = (p: { n: number; k?: number }) => {
      const ctx = fakeContext()

      INSTRUMENTS.flap(fakeGraph(ctx), 2, p)

      return {
        starts: startTimes(ctx),
        bands: ctx.nodes
          .filter((node) => node.kind === "filter")
          .map((node) => node.frequency.value),
      }
    }

    const plain = flapAt({ n: 6 })

    // Unseeded, or seeded with zero, it is the prototype's flap.
    expect(flapAt({ n: 6, k: 0 })).toEqual(plain)
    expect(flapAt({ n: 6, k: 3 }).starts).not.toEqual(plain.starts)
    expect(flapAt({ n: 6, k: 3 }).bands).not.toEqual(plain.bands)
  })

  it("play through the bus they are given, so a lane can be faded alone", () => {
    const ctx = fakeContext()
    const graph = fakeGraph(ctx)
    const lane = createLaneBus(graph, 0)

    INSTRUMENTS.hat(lane, 1, { v: 0.5 })

    // The hat sends to the lane's duck bus, not to the shared graph's.
    const connected = ctx.nodes.filter((node) =>
      node.connections.includes(lane.duck),
    )

    expect(connected.length).toBeGreaterThan(0)
    expect(
      ctx.nodes.filter((node) => node.connections.includes(graph.duck)),
    ).toEqual([])
  })
})

describe("lane buses", () => {
  it("are transparent at unity and trimmed by dB otherwise", () => {
    const ctx = fakeContext()
    const graph = fakeGraph(ctx)

    expect(asNode(createLaneBus(graph, 0).dry).gain.value).toBe(1)
    expect(asNode(createLaneBus(graph, -12).dry).gain.value).toBeCloseTo(
      10 ** (-12 / 20),
      8,
    )
  })

  it("fade every send together, from a given moment", () => {
    const ctx = fakeContext()
    const lane = createLaneBus(fakeGraph(ctx), 0)

    lane.fade(7, 0.4)

    for (const send of [lane.dry, lane.drum, lane.rev, lane.dly]) {
      const { calls } = asNode(send).gain

      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe("setTargetAtTime")
      expect(calls[0].args[0]).toBe(0)
      expect(calls[0].args[1]).toBe(7)
      expect(calls[0].args[2]).toBeCloseTo(0.1, 8)
    }
  })

  it("come out of the graph when disposed", () => {
    const ctx = fakeContext()
    const lane = createLaneBus(fakeGraph(ctx), 0)

    lane.dispose()

    for (const send of [lane.dry, lane.drum, lane.rev, lane.dly, lane.duck]) {
      expect(asNode(send).disconnected).toBeGreaterThan(0)
    }
  })

  it("keep the kick's ducking off the shared graph", () => {
    const ctx = fakeContext()
    const graph = fakeGraph(ctx)
    const lane: Bus = createLaneBus(graph, 0)

    INSTRUMENTS.kick(lane, 1, { v: 1 })

    expect(asNode(graph.duck).gain.calls).toEqual([])
    expect(asNode(lane.duck).gain.calls.length).toBeGreaterThan(0)
  })
})
