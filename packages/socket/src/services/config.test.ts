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
  const makeSeedDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-seed-"))
    tempRoots.push(dir)

    return dir
  }

  const writeQuiz = (dir: string, file: string, subject: string) =>
    fs.writeFileSync(path.join(dir, file), JSON.stringify(sampleQuiz(subject)))

  const subjectsOnVolume = () =>
    fs
      .readdirSync(path.join(configRoot, "quizz"))
      .sort()
      .map(
        (file) =>
          (
            JSON.parse(
              fs.readFileSync(path.join(configRoot, "quizz", file), "utf-8"),
            ) as { subject: string }
          ).subject,
      )

  const start = async () => {
    vi.resetModules()
    const { initConfig } = await import("@razzia/socket/services/config")

    initConfig()
  }

  it("seeds an empty volume, skips broken seed JSON and leaves game.json alone", async () => {
    const seedDir = makeSeedDir()
    fs.writeFileSync(
      path.join(configRoot, "game.json"),
      JSON.stringify({ managerPassword: "keep-me" }),
    )
    writeQuiz(seedDir, "netcode.json", "Netcode")
    fs.writeFileSync(path.join(seedDir, "broken.json"), "{")
    process.env.QUIZ_SEED_PATH = seedDir

    await start()

    const { getGameConfig } = await import("@razzia/socket/services/config")

    expect(getGameConfig().managerPassword).toBe("keep-me")
    expect(subjectsOnVolume()).toEqual(["Netcode"])
    expect(fs.existsSync(path.join(configRoot, ".seed-manifest.json"))).toBe(
      true,
    )
    expect(
      fs
        .readdirSync(path.join(configRoot, "quizz"))
        .filter((f) => f.endsWith(".tmp")),
    ).toEqual([])
  })

  it("keeps quizzes that exist only on the volume, and ones the seed dropped", async () => {
    const seedDir = makeSeedDir()
    writeQuiz(seedDir, "netcode.json", "Netcode")
    writeQuiz(seedDir, "gone.json", "Gone")
    process.env.QUIZ_SEED_PATH = seedDir
    await start()
    writeQuiz(path.join(configRoot, "quizz"), "mine.json", "Mine")
    fs.rmSync(path.join(seedDir, "gone.json"))

    await start()

    expect(subjectsOnVolume()).toEqual(["Gone", "Mine", "Netcode"])
  })

  it("updates a seeded quiz nobody edited when the committed one changes", async () => {
    const seedDir = makeSeedDir()
    writeQuiz(seedDir, "netcode.json", "Netcode")
    process.env.QUIZ_SEED_PATH = seedDir
    await start()
    writeQuiz(seedDir, "netcode.json", "Netcode v2")

    await start()

    expect(subjectsOnVolume()).toEqual(["Netcode v2"])
  })

  it("keeps a quiz edited on the volume, with a warning, when the committed one changes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const seedDir = makeSeedDir()
    writeQuiz(seedDir, "netcode.json", "Netcode")
    process.env.QUIZ_SEED_PATH = seedDir
    await start()
    writeQuiz(path.join(configRoot, "quizz"), "netcode.json", "Netcode edited")
    writeQuiz(seedDir, "netcode.json", "Netcode v2")

    await start()
    await start()

    expect(subjectsOnVolume()).toEqual(["Netcode edited"])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("netcode.json"))
    warn.mockRestore()
  })

  it("never overwrites a volume quiz on the first start after an upgrade", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const seedDir = makeSeedDir()
    writeQuiz(seedDir, "netcode.json", "Netcode")
    writeQuiz(seedDir, "same.json", "Same")
    writeQuiz(path.join(configRoot, "quizz"), "netcode.json", "Edited before")
    writeQuiz(path.join(configRoot, "quizz"), "same.json", "Same")
    process.env.QUIZ_SEED_PATH = seedDir

    await start()

    expect(subjectsOnVolume()).toEqual(["Edited before", "Same"])

    // The identical copy was recorded, so a later committed change reaches it.
    writeQuiz(seedDir, "same.json", "Same v2")
    await start()

    expect(subjectsOnVolume()).toEqual(["Edited before", "Same v2"])
  })

  it("reads a corrupt manifest as empty and starts anyway", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const seedDir = makeSeedDir()
    writeQuiz(seedDir, "netcode.json", "Netcode")
    writeQuiz(path.join(configRoot, "quizz"), "netcode.json", "Edited")
    fs.writeFileSync(path.join(configRoot, ".seed-manifest.json"), "{not json")
    process.env.QUIZ_SEED_PATH = seedDir

    await expect(start()).resolves.toBeUndefined()

    expect(subjectsOnVolume()).toEqual(["Edited"])
  })

  it("does not rewrite anything on a second start with nothing new", async () => {
    const seedDir = makeSeedDir()
    writeQuiz(seedDir, "netcode.json", "Netcode")
    process.env.QUIZ_SEED_PATH = seedDir
    await start()
    const manifest = path.join(configRoot, ".seed-manifest.json")
    const quiz = path.join(configRoot, "quizz/netcode.json")
    const before = [fs.statSync(manifest).mtimeMs, fs.statSync(quiz).mtimeMs]

    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })
    await start()

    expect([fs.statSync(manifest).mtimeMs, fs.statSync(quiz).mtimeMs]).toEqual(
      before,
    )
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

  it("tells a quiz that matches the committed one from one that was edited", async () => {
    const seedDir = makeSeedDir()
    writeQuiz(seedDir, "netcode.json", "Netcode")
    writeQuiz(seedDir, "springs.json", "Springs")
    process.env.QUIZ_SEED_PATH = seedDir
    await start()
    writeQuiz(path.join(configRoot, "quizz"), "mine.json", "Mine")
    const { getQuizzById, updateQuizz, getQuizzMeta } =
      await import("@razzia/socket/services/config")
    const springs = getQuizzById("springs")

    updateQuizz("springs", { ...springs, subject: "Springs, edited" })

    const state = Object.fromEntries(
      getQuizzMeta().map((q) => [q.id, q.seedState]),
    )

    expect(state).toEqual({
      netcode: "committed",
      springs: "edited",
      mine: undefined,
    })
  })

  it("reports no seed state at all when nothing was shipped", async () => {
    writeQuiz(path.join(configRoot, "quizz"), "mine.json", "Mine")
    const { getQuizzMeta } = await import("@razzia/socket/services/config")

    expect(getQuizzMeta().map((q) => q.seedState)).toEqual([undefined])
  })

  it("restores the committed copy of an edited quiz and lets later updates reach it", async () => {
    const seedDir = makeSeedDir()
    writeQuiz(seedDir, "springs.json", "Springs")
    process.env.QUIZ_SEED_PATH = seedDir
    await start()
    const { getQuizzById, updateQuizz, restoreCommittedQuizz, getQuizzMeta } =
      await import("@razzia/socket/services/config")

    updateQuizz("springs", {
      ...getQuizzById("springs"),
      subject: "Springs, edited",
    })
    expect(getQuizzMeta()[0].seedState).toBe("edited")

    restoreCommittedQuizz("springs")

    expect(getQuizzMeta()[0].seedState).toBe("committed")
    expect(subjectsOnVolume()).toEqual(["Springs"])

    writeQuiz(seedDir, "springs.json", "Springs v2")
    await start()

    expect(subjectsOnVolume()).toEqual(["Springs v2"])
  })

  it("will not restore a quiz that has no committed copy, or an unsafe id", async () => {
    const seedDir = makeSeedDir()
    writeQuiz(seedDir, "springs.json", "Springs")
    process.env.QUIZ_SEED_PATH = seedDir
    writeQuiz(path.join(configRoot, "quizz"), "mine.json", "Mine")
    const { restoreCommittedQuizz } =
      await import("@razzia/socket/services/config")

    expect(() => restoreCommittedQuizz("mine")).toThrow(
      "errors:quizz.noCommittedVersion",
    )
    expect(() => restoreCommittedQuizz("../springs")).toThrow()
    expect(subjectsOnVolume()).toEqual(["Mine"])
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

describe("initConfig without CONFIG_PATH", () => {
  const makeWorkspace = (withMarker: boolean) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-ws-"))
    tempRoots.push(root)
    const cwd = path.join(root, "packages", "socket")
    fs.mkdirSync(cwd, { recursive: true })

    if (withMarker) {
      fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n")
    }

    return { root, cwd }
  }

  beforeEach(() => {
    delete process.env.CONFIG_PATH
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("refuses to create a placeholder game.json outside the project", async () => {
    const { root, cwd } = makeWorkspace(false)
    vi.spyOn(process, "cwd").mockReturnValue(cwd)
    const { initConfig } = await import("@razzia/socket/services/config")

    expect(() => initConfig()).toThrow(/Refusing to create a config folder/)
    expect(fs.existsSync(path.join(root, "config"))).toBe(false)
  })

  it("creates the config folder and says so when run from packages/socket", async () => {
    const { root, cwd } = makeWorkspace(true)
    vi.spyOn(process, "cwd").mockReturnValue(cwd)
    const { initConfig } = await import("@razzia/socket/services/config")

    initConfig()

    expect(fs.existsSync(path.join(root, "config", "game.json"))).toBe(true)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("placeholder password"),
    )
  })

  it("uses a config folder that already exists, wherever it is", async () => {
    const { root, cwd } = makeWorkspace(false)
    fs.mkdirSync(path.join(root, "config"))
    fs.writeFileSync(
      path.join(root, "config", "game.json"),
      JSON.stringify({ managerPassword: "secret" }),
    )
    vi.spyOn(process, "cwd").mockReturnValue(cwd)
    const { initConfig, getGameConfig } =
      await import("@razzia/socket/services/config")

    initConfig()

    expect(getGameConfig().managerPassword).toBe("secret")
    expect(console.warn).not.toHaveBeenCalled()
  })
})
