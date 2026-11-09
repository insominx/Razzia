import { createInviteCode, timeToPoint } from "@razzia/socket/utils/game"
import { describe, expect, it, vi } from "vitest"

describe("createInviteCode", () => {
  it("returns six digits", () => {
    expect(createInviteCode()).toMatch(/^\d{6}$/u)
  })

  it("draws again while the code belongs to a live game", () => {
    const isTaken = vi
      .fn<(_code: string) => boolean>()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false)

    const code = createInviteCode(isTaken)

    expect(isTaken).toHaveBeenCalledTimes(3)
    expect(isTaken).toHaveBeenLastCalledWith(code)
    expect(code).toMatch(/^\d{6}$/u)
  })
})

describe("timeToPoint", () => {
  it.each([0, -1, -5, Number.NaN])("scores 0 for time %d", (time) => {
    expect(timeToPoint(Date.now(), time)).toBe(0)
    expect(timeToPoint(Date.now() - 3000, time)).toBe(0)
  })

  it("never exceeds the cap or goes below zero", () => {
    expect(timeToPoint(Date.now() + 5000, 10)).toBeLessThanOrEqual(1000)
    expect(timeToPoint(Date.now() - 60_000, 10)).toBe(0)
  })
})
