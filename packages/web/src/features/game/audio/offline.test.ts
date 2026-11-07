import {
  PROTOTYPE_T,
  referenceTimeline,
  renderTimeline,
  type TimelineEntry,
} from "@razzia/web/features/game/audio/offline"
import {
  type FakeAudioContext,
  fakeContext,
} from "@razzia/web/features/game/audio/test-support"
import { afterEach, describe, expect, it, vi } from "vitest"

const scene = (entries: readonly TimelineEntry[], name: string) =>
  entries.find((entry) => "spec" in entry && entry.spec.scene === name)

describe("the reference timeline", () => {
  const entries = referenceTimeline()

  it("starts each scene at the prototype's time, the way a screen would", () => {
    expect(scene(entries, "lobby")?.at).toBe(0)
    expect(scene(entries, "title")?.at).toBe(PROTOTYPE_T.title - 0.5)
    expect(scene(entries, "lamps")?.at).toBe(PROTOTYPE_T.lamps)
    expect(scene(entries, "reading")?.at).toBe(PROTOTYPE_T.read - 0.5)
    expect(scene(entries, "answers")?.at).toBe(PROTOTYPE_T.power)
    expect(scene(entries, "verdict")?.at).toBe(PROTOTYPE_T.time)
    expect(scene(entries, "leaderboard")?.at).toBe(PROTOTYPE_T.board)
    expect(scene(entries, "podium")?.at).toBe(PROTOTYPE_T.podium)
  })

  it("stamps the answers so the drop lands on the prototype's unlock", () => {
    const entry = scene(entries, "answers")

    expect(entry && "spec" in entry && entry.spec).toMatchObject({
      scene: "answers",
      unlockAt: PROTOTYPE_T.open * 1000,
      revealStartedAt: (PROTOTYPE_T.open - 12) * 1000,
      answers: 4,
      time: PROTOTYPE_T.time - PROTOTYPE_T.open,
    })
  })

  it("has fourteen joins and seventeen answers", () => {
    const cues = entries.filter((entry) => "cue" in entry)

    expect(cues.filter((entry) => entry.cue.cue === "join")).toHaveLength(14)
    expect(cues.filter((entry) => entry.cue.cue === "pop")).toHaveLength(17)
  })
})

describe("renderTimeline", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("rejects where there is no OfflineAudioContext", async () => {
    await expect(renderTimeline([], { duration: 1 })).rejects.toThrow(
      /OfflineAudioContext/,
    )
  })

  it("renders through the live engine: a lamp's clunks land a second apart", async () => {
    const ctx = fakeContext()
    const built: FakeAudioContext[] = []

    vi.stubGlobal("OfflineAudioContext", function Offline() {
      built.push(ctx)

      return Object.assign(ctx, {
        startRendering: () => Promise.resolve({ duration: 5 }),
      })
    })

    await renderTimeline([{ at: 1, spec: { scene: "lamps" } }], { duration: 6 })

    const clunks = ctx.nodes
      .filter((node) => node.kind === "oscillator" && node.started.length > 0)
      .flatMap((node) => node.started)
      .filter((time) => time > 0)
      .sort((a, b) => a - b)

    // 10 ms of lead, then the scene's own t = 0 at second one.
    expect(built).toHaveLength(1)
    expect(clunks[0]).toBeCloseTo(1.01, 3)
    expect(clunks.some((time) => Math.abs(time - 2.01) < 1e-3)).toBe(true)
    expect(clunks.some((time) => Math.abs(time - 3.01) < 1e-3)).toBe(true)
  })

  it("does not schedule beyond what a live round would: a cut scene stops where it was cut", async () => {
    const ctx = fakeContext()

    vi.stubGlobal("OfflineAudioContext", function Offline() {
      return Object.assign(ctx, {
        startRendering: () => Promise.resolve({ duration: 30 }),
      })
    })

    await renderTimeline(
      [
        { at: 0, spec: { scene: "lobby" } },
        { at: 4, spec: { scene: "title" } },
      ],
      { duration: 30 },
    )

    const lobbyPads = ctx.nodes
      .filter((node) => node.kind === "oscillator" && node.type === "sawtooth")
      .flatMap((node) => node.started)

    // The lobby ran for four seconds, not thirty.
    expect(Math.max(...lobbyPads)).toBeLessThan(6)
  })
})
