import type { SoundTheme } from "@razzia/common/types/visuals"
import {
  type ControllerDeps,
  createScore,
  type HowlerLike,
  POLL_HOLD_FADE_S,
  type SoundState,
} from "@razzia/web/features/game/audio/controller"
import type { Engine } from "@razzia/web/features/game/audio/engine"
import type { LegacyRunner } from "@razzia/web/features/game/audio/legacy"
import type { Scene } from "@razzia/web/features/game/audio/music"
import type { SceneSpec } from "@razzia/web/features/game/audio/scenes"
import {
  fakeContext,
  fakeNode,
  manualClock,
} from "@razzia/web/features/game/audio/test-support"
import { describe, expect, it, vi } from "vitest"

// While a poll covers the host's stage (`pollStage`), the quiz's sound under it
// holds and only the poll's own cues play. Howler is never muted for it, so
// the poll stays audible in a deck.

const LOBBY: SceneSpec = { scene: "lobby" }

const setup = (
  initial: Partial<SoundState> = {},
  theme: SoundTheme = "show",
) => {
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
  const engine = {
    start: vi.fn((_scene: Scene, _originMs: number) => true),
    cue: vi.fn(),
    pump: vi.fn(() => true),
    hasWork: vi.fn(() => true),
    stop: vi.fn(),
    live: vi.fn(() => ({})),
    dispose: vi.fn(),
  } satisfies Engine
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
    gestures: new EventTarget(),
    now: clock.now,
    timers: clock.timers(),
    createEngine: () => engine,
  }
  const score = createScore(deps)

  score.configure({ intensity: "full", theme, surface: "host" })

  const setSound = (patch: Partial<SoundState>) => {
    Object.assign(state, patch)

    for (const listener of listeners) {
      listener()
    }
  }

  return { clock, engine, legacy, score, setSound }
}

describe("the score under a poll", () => {
  it("plays the poll's cues while the quiz's are held", () => {
    const { engine, score } = setup({ pollStage: true })

    score.cue({ cue: "join", index: 0 })
    expect(engine.cue).not.toHaveBeenCalled()

    score.cue({ cue: "vote", share: 0.5 })
    score.cue({ cue: "beat", strength: 1 })
    expect(engine.cue).toHaveBeenCalledTimes(2)
  })

  it("holds the lobby's bed, fading what rings, and picks it back up after", () => {
    const { clock, engine, score, setSound } = setup()
    const startedAt = clock.time

    score.start(LOBBY)
    expect(clock.intervals()).toBe(1)

    setSound({ pollStage: true })

    expect(engine.stop).toHaveBeenLastCalledWith(undefined, POLL_HOLD_FADE_S)
    expect(clock.intervals()).toBe(0)

    clock.advance(5000)
    engine.start.mockClear()
    setSound({ pollStage: false })

    // Back on the same anchor, so the bed joins mid-bar.
    expect(engine.start).toHaveBeenCalledTimes(1)
    expect(engine.start.mock.calls[0][1]).toBe(startedAt)
    expect(clock.intervals()).toBe(1)
  })

  it("does not start the quiz's scenes while a poll covers the stage", () => {
    const { engine, score } = setup({ pollStage: true })

    score.start(LOBBY)

    expect(engine.start).not.toHaveBeenCalled()
  })

  it.each([
    ["muted", { muted: true }],
    ["suppressed by the deck", { suppressed: true }],
    ["at zero volume", { volume: 0 }],
  ] as const)("plays no poll cue while %s", (_name, sound) => {
    const { engine, score } = setup({ pollStage: true, ...sound })

    score.cue({ cue: "vote", share: 1 })
    score.cue({ cue: "beat", strength: 1 })

    expect(engine.cue).not.toHaveBeenCalled()
  })

  it("does not fade anything for a mute: the mute has silenced it already", () => {
    const { engine, score, setSound } = setup()

    score.start(LOBBY)
    setSound({ muted: true })

    expect(engine.stop).not.toHaveBeenCalled()
  })

  it("plays a vote through an old pack, but holds its quiz cues", () => {
    const { legacy, score } = setup({ pollStage: true }, "classic")

    score.cue({ cue: "pop", index: 1 })
    expect(legacy.cue).not.toHaveBeenCalled()

    score.cue({ cue: "vote", share: 0.5 })
    expect(legacy.cue).toHaveBeenCalledWith(
      expect.objectContaining({ sfx: "pop" }),
      "full",
    )
  })
})
