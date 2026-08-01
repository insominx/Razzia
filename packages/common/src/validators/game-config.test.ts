import { describe, expect, it } from "vitest"
import { gameConfigValidator } from "@razzia/common/validators/game-config"

describe("gameConfigValidator", () => {
  it("requires managerPassword", () => {
    expect(gameConfigValidator.safeParse({}).success).toBe(false)
    expect(
      gameConfigValidator.safeParse({ managerPassword: "secret" }).success,
    ).toBe(true)
  })

  it("rejects invalid background paths inside visuals without dropping password shape", () => {
    const result = gameConfigValidator.safeParse({
      managerPassword: "secret",
      visuals: {
        background: { kind: "config-asset", path: "../evil.png" },
      },
    })

    expect(result.success).toBe(false)
  })

  it("falls back unknown dialect without discarding password", () => {
    const result = gameConfigValidator.parse({
      managerPassword: "secret",
      visuals: { dialect: "neon-disco" },
    })

    expect(result.managerPassword).toBe("secret")
    expect(result.visuals?.dialect).toBe("dark-everywhere")
  })
})
