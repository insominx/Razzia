import { createInviteCode } from "@razzia/socket/utils/game"
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
