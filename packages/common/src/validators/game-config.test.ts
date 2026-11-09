import { describe, expect, it, vi } from "vitest"
import { gameConfigValidator } from "@razzia/common/validators/game-config"

describe("gameConfigValidator", () => {
  it("requires managerPassword", () => {
    expect(gameConfigValidator.safeParse({}).success).toBe(false)
    expect(
      gameConfigValidator.safeParse({ managerPassword: "secret" }).success,
    ).toBe(true)
  })

  it("drops an invalid background path and keeps the password", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const result = gameConfigValidator.safeParse({
      managerPassword: "secret",
      visuals: {
        background: { kind: "config-asset", path: "../evil.png" },
        dialect: "stage-studio",
      },
    })

    expect(result.success).toBe(true)
    expect(result.data?.managerPassword).toBe("secret")
    expect(result.data?.visuals?.background).toBeUndefined()
    expect(result.data?.visuals?.dialect).toBe("stage-studio")
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("still rejects a missing or non-string password next to a bad background", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    expect(
      gameConfigValidator.safeParse({
        visuals: { background: "nonsense" },
      }).success,
    ).toBe(false)
    expect(
      gameConfigValidator.safeParse({
        managerPassword: 42,
        visuals: { background: { kind: "config-asset", path: "../x.png" } },
      }).success,
    ).toBe(false)
    vi.restoreAllMocks()
  })

  it("keeps a valid background", () => {
    const result = gameConfigValidator.parse({
      managerPassword: "secret",
      visuals: { background: { kind: "config-asset", path: "room.png" } },
    })

    expect(result.visuals?.background).toEqual({
      kind: "config-asset",
      path: "room.png",
    })
  })

  it("falls back unknown dialect without discarding password", () => {
    const result = gameConfigValidator.parse({
      managerPassword: "secret",
      visuals: { dialect: "neon-disco" },
    })

    expect(result.managerPassword).toBe("secret")
    expect(result.visuals?.dialect).toBe("dark-everywhere")
  })

  it("falls back unknown sound theme without discarding password", () => {
    const result = gameConfigValidator.parse({
      managerPassword: "secret",
      visuals: { soundTheme: "neon-disco" },
    })

    expect(result.managerPassword).toBe("secret")
    expect(result.visuals?.soundTheme).toBe("show")
  })

  it("falls back an unknown show intensity without discarding password", () => {
    const result = gameConfigValidator.parse({
      managerPassword: "secret",
      visuals: { showIntensity: "extreme" },
    })

    expect(result.managerPassword).toBe("secret")
    expect(result.visuals?.showIntensity).toBe("full")
  })

  it("keeps a valid show intensity", () => {
    const result = gameConfigValidator.parse({
      managerPassword: "secret",
      visuals: { showIntensity: "silent" },
    })

    expect(result.visuals?.showIntensity).toBe("silent")
  })
})
