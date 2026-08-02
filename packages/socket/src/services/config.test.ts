import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

const tempRoots: string[] = []

let configRoot = ""

const makeTempConfig = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-config-"))
  tempRoots.push(root)
  process.env.CONFIG_PATH = root

  return root
}

beforeEach(() => {
  vi.resetModules()
  configRoot = makeTempConfig()
  fs.mkdirSync(path.join(configRoot, "quizz"))
})

afterEach(() => {
  delete process.env.CONFIG_PATH
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe("getGameConfig fail-closed", () => {
  it("throws when visuals contain an invalid background path instead of returning empty config", async () => {
    const root = configRoot
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
    const root = configRoot
    fs.writeFileSync(path.join(root, "game.json"), JSON.stringify({}))

    const { getGameConfig } = await import("@razzia/socket/services/config")

    expect(() => getGameConfig()).toThrow()
  })

  it("returns parsed config when valid", async () => {
    const root = configRoot
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
    const root = configRoot
    fs.mkdirSync(path.join(root, "quizz"), { recursive: true })
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

describe("updateGameConfig", () => {
  it("preserves prior fields across sequential updates", async () => {
    const root = configRoot
    fs.writeFileSync(
      path.join(root, "game.json"),
      JSON.stringify({ managerPassword: "secret" }),
    )
    fs.mkdirSync(path.join(root, "assets/backgrounds"), { recursive: true })
    fs.writeFileSync(path.join(root, "assets/backgrounds/room.png"), "x")

    const { getGameConfig, updateGameConfig } =
      await import("@razzia/socket/services/config")

    updateGameConfig((config) => ({
      ...config,
      visuals: { ...config.visuals, dialect: "stage-studio" },
    }))
    updateGameConfig((config) => ({
      ...config,
      visuals: {
        ...config.visuals,
        background: { kind: "config-asset", path: "room.png" },
      },
    }))

    expect(getGameConfig().visuals?.dialect).toBe("stage-studio")
    expect(getGameConfig().visuals?.background?.path).toBe("room.png")
  })
})

describe("getReferencedBackgroundAssetPaths", () => {
  it("collects valid global and quiz background references", async () => {
    fs.writeFileSync(
      path.join(configRoot, "game.json"),
      JSON.stringify({
        managerPassword: "secret",
        visuals: {
          background: { kind: "config-asset", path: "global.png" },
        },
      }),
    )
    fs.writeFileSync(
      path.join(configRoot, "quizz/quiz.json"),
      JSON.stringify({
        subject: "Quiz",
        visuals: {
          background: { kind: "config-asset", path: "quiz.webp" },
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

    const { getReferencedBackgroundAssetPaths } =
      await import("@razzia/socket/services/config")

    expect([...getReferencedBackgroundAssetPaths()].sort()).toEqual([
      "global.png",
      "quiz.webp",
    ])
  })

  it("throws instead of treating malformed quiz config as no references", async () => {
    fs.writeFileSync(
      path.join(configRoot, "game.json"),
      JSON.stringify({ managerPassword: "secret" }),
    )
    fs.writeFileSync(path.join(configRoot, "quizz/broken.json"), "{")

    const { getReferencedBackgroundAssetPaths } =
      await import("@razzia/socket/services/config")

    expect(() => getReferencedBackgroundAssetPaths()).toThrow()
  })
})
