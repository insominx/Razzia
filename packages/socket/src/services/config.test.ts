import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

const tempRoots: string[] = []

const makeTempConfig = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-config-"))
  tempRoots.push(root)
  process.env.CONFIG_PATH = root
  return root
}

beforeEach(() => {
  vi.resetModules()
  makeTempConfig()
})

afterEach(() => {
  delete process.env.CONFIG_PATH
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe("getGameConfig fail-closed", () => {
  it("throws when visuals contain an invalid background path instead of returning empty config", async () => {
    const root = process.env.CONFIG_PATH!
    fs.writeFileSync(
      path.join(root, "game.json"),
      JSON.stringify({
        managerPassword: "secret",
        visuals: {
          background: { kind: "config-asset", path: "../evil.png" },
        },
      }),
    )

    const { getGameConfig } = await import("@razzia/socket/services/config")

    expect(() => getGameConfig()).toThrow()
  })

  it("throws when managerPassword is missing", async () => {
    const root = process.env.CONFIG_PATH!
    fs.writeFileSync(path.join(root, "game.json"), JSON.stringify({}))

    const { getGameConfig } = await import("@razzia/socket/services/config")

    expect(() => getGameConfig()).toThrow()
  })

  it("returns parsed config when valid", async () => {
    const root = process.env.CONFIG_PATH!
    fs.writeFileSync(
      path.join(root, "game.json"),
      JSON.stringify({ managerPassword: "secret" }),
    )

    const { getGameConfig } = await import("@razzia/socket/services/config")

    expect(getGameConfig().managerPassword).toBe("secret")
  })
})

describe("getQuizz soft-strips invalid visuals", () => {
  it("keeps a quiz when only visuals.background is invalid", async () => {
    const root = process.env.CONFIG_PATH!
    fs.mkdirSync(path.join(root, "quizz"))
    fs.writeFileSync(
      path.join(root, "quizz/broken-bg.json"),
      JSON.stringify({
        subject: "Broken BG",
        visuals: {
          background: { kind: "config-asset", path: "../evil.png" },
        },
        questions: [
          {
            question: "Q1",
            answers: ["A", "B"],
            solutions: [0],
            cooldown: 5,
            time: 20,
          },
        ],
      }),
    )

    const { getQuizz } = await import("@razzia/socket/services/config")
    const quizzes = getQuizz()

    expect(quizzes).toHaveLength(1)
    expect(quizzes[0].subject).toBe("Broken BG")
    expect(quizzes[0].visuals).toBeUndefined()
  })
})

describe("updateGameConfig serialization", () => {
  it("does not lose concurrent dialect and background updates", async () => {
    const root = process.env.CONFIG_PATH!
    fs.writeFileSync(
      path.join(root, "game.json"),
      JSON.stringify({ managerPassword: "secret" }),
    )

    const { getGameConfig, updateGameConfig } = await import(
      "@razzia/socket/services/config"
    )

    const first = updateGameConfig((config) => ({
      ...config,
      visuals: { ...config.visuals, dialect: "stage-studio" },
    }))

    const second = updateGameConfig((config) => ({
      ...config,
      visuals: {
        ...config.visuals,
        background: { kind: "config-asset", path: "room.png" },
      },
    }))

    // Create a real room.png so existence checks can pass later if enforced
    fs.mkdirSync(path.join(root, "assets/backgrounds"), { recursive: true })
    fs.writeFileSync(path.join(root, "assets/backgrounds/room.png"), "x")

    expect(first.visuals?.dialect).toBe("stage-studio")
    expect(second.visuals?.background?.path).toBe("room.png")
    expect(getGameConfig().visuals?.dialect).toBe("stage-studio")
    expect(getGameConfig().visuals?.background?.path).toBe("room.png")
  })
})
