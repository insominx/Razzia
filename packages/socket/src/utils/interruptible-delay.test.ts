import { createInterruptibleDelay } from "@razzia/socket/utils/interruptible-delay"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("createInterruptibleDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("resolves once when the duration elapses and clears its timer", async () => {
    const delay = createInterruptibleDelay(1_400)
    const resolved = vi.fn()
    void delay.promise.then(resolved)

    await vi.advanceTimersByTimeAsync(1_399)
    expect(resolved).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(resolved).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("interrupts immediately and removes the pending timer", async () => {
    const delay = createInterruptibleDelay(3_600)
    const resolved = vi.fn()
    void delay.promise.then(resolved)

    delay.interrupt()
    await delay.promise

    expect(resolved).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("ignores duplicate interrupts and later timer advancement", async () => {
    const delay = createInterruptibleDelay(3_600)
    const resolved = vi.fn()
    void delay.promise.then(resolved)

    delay.interrupt()
    delay.interrupt()
    await vi.runAllTimersAsync()

    expect(resolved).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
