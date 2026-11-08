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
  delete process.env.QUIZ_SEED_PATH
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe("getGameConfig", () => {
  it("keeps the password and drops an invalid background path, with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
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

    const config = getGameConfig()

    expect(config.managerPassword).toBe("secret")
    expect(config.visuals?.background).toBeUndefined()
    expect(warn).toHaveBeenCalled()
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

const sampleQuiz = (subject: string) => ({
  subject,
  questions: [
    {
      question: `${subject} Q1`,
      answers: ["A", "B"],
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
  ],
})

describe("initConfig quiz seed", () => {
  it("replaces volume quizzes with seed JSON and leaves game.json alone", async () => {
    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-seed-"))
    tempRoots.push(seedDir)
    fs.writeFileSync(
      path.join(configRoot, "game.json"),
      JSON.stringify({ managerPassword: "keep-me" }),
    )
    fs.writeFileSync(
      path.join(configRoot, "quizz/old.json"),
      JSON.stringify(sampleQuiz("Old")),
    )
    fs.writeFileSync(
      path.join(seedDir, "netcode.json"),
      JSON.stringify(sampleQuiz("Netcode")),
    )
    fs.writeFileSync(path.join(seedDir, "broken.json"), "{")
    process.env.QUIZ_SEED_PATH = seedDir

    const { initConfig, getGameConfig, getQuizz } =
      await import("@razzia/socket/services/config")

    initConfig()

    expect(getGameConfig().managerPassword).toBe("keep-me")
    expect(fs.existsSync(path.join(configRoot, "quizz/old.json"))).toBe(false)
    expect(fs.existsSync(path.join(configRoot, "quizz/broken.json"))).toBe(
      false,
    )
    expect(getQuizz().map((quiz) => quiz.subject)).toEqual(["Netcode"])
  })

  it("does not wipe volume quizzes when the seed has no valid JSON", async () => {
    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-seed-"))
    tempRoots.push(seedDir)
    fs.writeFileSync(path.join(seedDir, "broken.json"), "{")
    fs.writeFileSync(
      path.join(configRoot, "quizz/keep.json"),
      JSON.stringify(sampleQuiz("Keep")),
    )
    process.env.QUIZ_SEED_PATH = seedDir

    const { initConfig, getQuizz } =
      await import("@razzia/socket/services/config")

    initConfig()

    expect(getQuizz().map((quiz) => quiz.subject)).toEqual(["Keep"])
  })

  it("writes the example quiz when there is no seed and no quizz folder", async () => {
    fs.rmSync(path.join(configRoot, "quizz"), { recursive: true, force: true })

    const { initConfig, getQuizz } =
      await import("@razzia/socket/services/config")

    initConfig()

    expect(getQuizz().some((quiz) => quiz.id === "example")).toBe(true)
  })
})

const listFiles = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []

describe("quizz and result functions given hostile input", () => {
  const hostile: unknown[] = [
    undefined,
    null,
    42,
    "text",
    [],
    {},
    { subject: "x", questions: null },
    { subject: "x", questions: "nope" },
    { subject: 5, questions: [] },
    { subject: "x", questions: [null, 1, "a"] },
    { subject: "x", questions: [{ question: "q", answers: null }] },
    { subject: "x".repeat(5_000_000), questions: [] },
  ]

  it("saveQuizz throws on every one and writes nothing", async () => {
    const { saveQuizz } = await import("@razzia/socket/services/config")

    for (const input of hostile) {
      expect(() => saveQuizz(input)).toThrow()
    }

    expect(listFiles(path.join(configRoot, "quizz"))).toEqual([])
  })

  it("updateQuizz throws on every one and leaves the stored quizz as it was", async () => {
    const { saveQuizz, updateQuizz } =
      await import("@razzia/socket/services/config")
    const { id } = saveQuizz({
      subject: "Kept",
      questions: [
        {
          question: "Pick one",
          answers: ["No", "Yes"],
          solutions: [1],
          cooldown: 5,
          time: 5,
        },
      ],
    })
    const file = path.join(configRoot, "quizz", `${id}.json`)
    const before = fs.readFileSync(file, "utf8")

    for (const input of hostile) {
      expect(() => updateQuizz(id, input)).toThrow()
    }

    expect(fs.readFileSync(file, "utf8")).toBe(before)
    expect(listFiles(path.join(configRoot, "quizz"))).toEqual([`${id}.json`])
  })

  it("refuses ids that are not plain ids or that name nothing", async () => {
    const { getQuizzById, deleteQuizz, getResultById, deleteResult } =
      await import("@razzia/socket/services/config")
    const ids = ["", "../game", "..\\game", "a/b", "missing", "x".repeat(300)]

    for (const id of ids) {
      expect(() => getQuizzById(id)).toThrow()
      expect(() => deleteQuizz(id)).toThrow()
      expect(() => getResultById(id)).toThrow()
      expect(() => deleteResult(id)).toThrow()
    }
  })

  it("reads a truncated or foreign file on disk as an error, not as data", async () => {
    fs.writeFileSync(path.join(configRoot, "quizz", "broken.json"), '{"subj')
    fs.writeFileSync(path.join(configRoot, "quizz", "alien.json"), "[1,2,3]")
    fs.mkdirSync(path.join(configRoot, "results"))
    fs.writeFileSync(path.join(configRoot, "results", "broken.json"), "{")

    const { getQuizzById, getResultById, getResultsMeta } =
      await import("@razzia/socket/services/config")

    expect(() => getQuizzById("broken")).toThrow()
    expect(() => getQuizzById("alien")).toThrow()
    expect(() => getResultById("broken")).toThrow()
    expect(() => getResultsMeta()).not.toThrow()
  })
})
