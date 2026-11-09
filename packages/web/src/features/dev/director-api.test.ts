import {
  type DirectorApi,
  getDirector,
  publishDirector,
  waitForDirector,
} from "@razzia/web/features/dev/director-api"
import { afterEach, describe, expect, it, vi } from "vitest"

const fakeApi = {} as DirectorApi

describe("director api", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("publishes and withdraws on a window", () => {
    const win = {} as Window

    expect(getDirector(win)).toBeNull()
    publishDirector(win, fakeApi)
    expect(getDirector(win)).toBe(fakeApi)
    publishDirector(win, null)
    expect(getDirector(win)).toBeNull()
    expect(getDirector(null)).toBeNull()
  })

  it("waits for a frame that mounts after load", async () => {
    vi.useFakeTimers()
    const win = {} as Window
    const waiting = waitForDirector(() => win)

    await vi.advanceTimersByTimeAsync(200)
    publishDirector(win, fakeApi)
    await vi.advanceTimersByTimeAsync(50)

    await expect(waiting).resolves.toBe(fakeApi)
  })

  it("gives up on a frame that never starts", async () => {
    vi.useFakeTimers()
    const waiting = waitForDirector(() => ({}) as Window, { timeoutMs: 500 })
    const settled = expect(waiting).rejects.toThrow("never started")

    await vi.advanceTimersByTimeAsync(1_000)
    await settled
  })
})
