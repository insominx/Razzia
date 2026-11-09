import {
  insertSmallSpeakers,
  SMALL_SPEAKER_CUTOFF_HZ,
} from "@razzia/web/features/dev/small-speakers"
import { describe, expect, it, vi } from "vitest"

const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })

const filter = () => ({
  ...node(),
  type: "",
  frequency: { value: 0 },
  Q: { value: 0 },
})

describe("insertSmallSpeakers", () => {
  const setup = () => {
    const filters = [filter(), filter()]
    const destination = {}
    const ctx = {
      destination,
      createBiquadFilter: vi.fn(() => filters.shift() ?? filter()),
    }
    const masterGain = node()

    return { ctx, destination, masterGain }
  }

  it("routes the master gain through two 250 Hz high-passes", () => {
    const { ctx, destination, masterGain } = setup()

    insertSmallSpeakers({
      ctx: ctx as unknown as AudioContext,
      masterGain: masterGain as unknown as AudioNode,
    })

    expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(2)
    expect(masterGain.disconnect).toHaveBeenCalledOnce()

    const [first] = masterGain.connect.mock.calls[0] as [
      ReturnType<typeof filter>,
    ]
    const [second] = first.connect.mock.calls[0] as [ReturnType<typeof filter>]

    for (const stage of [first, second]) {
      expect(stage.type).toBe("highpass")
      expect(stage.frequency.value).toBe(SMALL_SPEAKER_CUTOFF_HZ)
      expect(stage.Q.value).toBeCloseTo(Math.SQRT1_2, 10)
    }
    expect(second.connect).toHaveBeenCalledWith(destination)
  })

  it("puts the master gain straight back on the destination when undone", () => {
    const { ctx, destination, masterGain } = setup()
    const undo = insertSmallSpeakers({
      ctx: ctx as unknown as AudioContext,
      masterGain: masterGain as unknown as AudioNode,
    })

    undo()

    expect(masterGain.connect).toHaveBeenLastCalledWith(destination)
    expect(masterGain.disconnect).toHaveBeenCalledTimes(2)
  })
})
