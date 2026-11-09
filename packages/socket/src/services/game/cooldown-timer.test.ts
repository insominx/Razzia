import type { Server } from "@razzia/common/types/game/socket"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { NO_TIME_LIMIT } from "@razzia/common/constants"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createTimer = () => {
  const emit = vi.fn()
  const io = { to: vi.fn(() => ({ emit })) } as unknown as Server

  return { timer: new CooldownTimer(io, "game-1"), emit }
}

const settled = async (promise: Promise<void>) => {
  let done = false

  void promise.then(() => {
    done = true
  })
  await Promise.resolve()
  await Promise.resolve()

  return done
}

describe("CooldownTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("counts down once a second and ends on time", async () => {
    const { timer, emit } = createTimer()
    const done = timer.start(3)

    await vi.advanceTimersByTimeAsync(2_000)
    expect(emit.mock.calls).toEqual([
      ["game:cooldown", 2],
      ["game:cooldown", 1],
    ])
    expect(await settled(done)).toBe(false)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(await settled(done)).toBe(true)
  })

  it("ends at once when aborted, not on the next tick", async () => {
    const { timer, emit } = createTimer()
    const done = timer.start(10)

    await vi.advanceTimersByTimeAsync(2_500)
    emit.mockClear()
    timer.abort()

    expect(await settled(done)).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(emit).not.toHaveBeenCalled()
  })

  it("ends an untimed question at once when aborted", async () => {
    const { timer } = createTimer()
    const done = timer.start(NO_TIME_LIMIT)

    await vi.advanceTimersByTimeAsync(500)
    timer.abort()

    expect(await settled(done)).toBe(true)
  })

  it("can run again straight after an abort", async () => {
    const { timer } = createTimer()

    void timer.start(10)
    timer.abort()
    const again = timer.start(2)

    expect(await settled(again)).toBe(false)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await settled(again)).toBe(true)
  })
})
