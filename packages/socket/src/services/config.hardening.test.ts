import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

const tempRoots: string[] = []

let configRoot = ""

const sampleQuiz = (subject: string) => ({
  subject,
  questions: [
    {
      question: "Q1",
      answers: ["A", "B"],
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
  ],
})

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  configRoot = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-hardening-"))
  tempRoots.push(configRoot)
  process.env.CONFIG_PATH = configRoot
  fs.mkdirSync(path.join(configRoot, "quizz"))
  fs.writeFileSync(
    path.join(configRoot, "game.json"),
    JSON.stringify({ managerPassword: "secret" }),
  )
})

afterEach(() => {
  delete process.env.CONFIG_PATH
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe("hostile ids", () => {
  it.each(["../game", "a/b", "", "..\\game"])(
    "rejects %j in every id based function",
    async (id) => {
      fs.mkdirSync(path.join(configRoot, "results"))

      const {
        getResultById,
        deleteResult,
        getQuizzById,
        deleteQuizz,
        updateQuizz,
      } = await import("@razzia/socket/services/config")

      expect(() => getResultById(id)).toThrow()
      expect(() => deleteResult(id)).toThrow()
      expect(() => getQuizzById(id)).toThrow()
      expect(() => deleteQuizz(id)).toThrow()
      expect(() => updateQuizz(id, sampleQuiz("X"))).toThrow()
      expect(fs.existsSync(path.join(configRoot, "game.json"))).toBe(true)
    },
  )
})

describe("quizz files", () => {
  it("skips one corrupt file instead of hiding every quizz", async () => {
    fs.writeFileSync(
      path.join(configRoot, "quizz/good.json"),
      JSON.stringify(sampleQuiz("Good")),
    )
    fs.writeFileSync(path.join(configRoot, "quizz/bad.json"), "{")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const { getQuizz } = await import("@razzia/socket/services/config")

    expect(getQuizz().map((quiz) => quiz.id)).toEqual(["good"])
  })

  it("strips only the trailing .json to make the id", async () => {
    fs.writeFileSync(
      path.join(configRoot, "quizz/week1.json.bak.json"),
      JSON.stringify(sampleQuiz("Week")),
    )

    const { getQuizz, getQuizzById } =
      await import("@razzia/socket/services/config")

    const ids = getQuizz().map((quiz) => quiz.id)

    expect(ids).toEqual(["week1.json.bak"])
    expect(getQuizzById(ids[0]).subject).toBe("Week")
  })

  it("reads a quizz and game config saved with a BOM", async () => {
    fs.writeFileSync(
      path.join(configRoot, "quizz/bom.json"),
      `﻿${JSON.stringify(sampleQuiz("Bom"))}`,
    )
    fs.writeFileSync(
      path.join(configRoot, "game.json"),
      `﻿${JSON.stringify({ managerPassword: "secret" })}`,
    )

    const { getQuizz, getGameConfig } =
      await import("@razzia/socket/services/config")

    expect(getQuizz()).toHaveLength(1)
    expect(getGameConfig().managerPassword).toBe("secret")
  })

  it("can update and delete a quizz whose visuals are invalid", async () => {
    const broken = {
      ...sampleQuiz("Broken"),
      visuals: { background: { kind: "config-asset", path: "../x" } },
    }
    fs.writeFileSync(
      path.join(configRoot, "quizz/broken.json"),
      JSON.stringify(broken),
    )
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const { updateQuizz, deleteQuizz, getQuizz } =
      await import("@razzia/socket/services/config")

    expect(getQuizz()).toHaveLength(1)
    expect(() => updateQuizz("broken", sampleQuiz("Fixed"))).not.toThrow()
    expect(() => deleteQuizz("broken")).not.toThrow()
    expect(getQuizz()).toHaveLength(0)
  })

  it("keeps the reference scan working with an invalid quizz present", async () => {
    fs.writeFileSync(path.join(configRoot, "quizz/invalid.json"), "{}")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const { getReferencedBackgroundAssetPaths } =
      await import("@razzia/socket/services/config")

    expect(() => getReferencedBackgroundAssetPaths()).not.toThrow()
  })

  it("refuses to save a background that was never uploaded", async () => {
    const { saveQuizz } = await import("@razzia/socket/services/config")

    expect(() =>
      saveQuizz({
        ...sampleQuiz("Dangling"),
        visuals: { background: { kind: "config-asset", path: "ghost.png" } },
      }),
    ).toThrow("errors:visuals.invalidBackgroundPath")
  })

  it("leaves no temp file behind after a save", async () => {
    const { saveQuizz } = await import("@razzia/socket/services/config")

    saveQuizz(sampleQuiz("Atomic"))

    expect(
      fs
        .readdirSync(path.join(configRoot, "quizz"))
        .filter((file) => file.endsWith(".tmp")),
    ).toEqual([])
  })
})

describe("game.json", () => {
  it("gives a clear error for truncated JSON", async () => {
    fs.writeFileSync(path.join(configRoot, "game.json"), "")

    const { getGameConfig } = await import("@razzia/socket/services/config")

    expect(() => getGameConfig()).toThrow("Game config is not valid JSON")
  })
})

describe("results store", () => {
  const result = (id: string, date: string, players: unknown = []) =>
    ({ id, subject: id, date, players }) as never

  it("round trips save, list, get and delete", async () => {
    const { saveResult, getResultsMeta, getResultById, deleteResult } =
      await import("@razzia/socket/services/config")

    expect(saveResult(result("r1", "2025-01-01T00:00:00Z", [{}, {}]))).toBe(
      true,
    )
    expect(getResultsMeta()).toEqual([
      { id: "r1", subject: "r1", date: "2025-01-01T00:00:00Z", playerCount: 2 },
    ])
    expect(getResultById("r1").id).toBe("r1")

    deleteResult("r1")

    expect(getResultsMeta()).toEqual([])
    expect(() => getResultById("r1")).toThrow()
  })

  it("reports a failed write so the caller can retry", async () => {
    fs.writeFileSync(path.join(configRoot, "results"), "not a directory")
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const { saveResult } = await import("@razzia/socket/services/config")

    expect(saveResult(result("r1", "2025-01-01"))).toBe(false)
  })

  it("lists by file name, tolerates bad dates and missing players", async () => {
    fs.mkdirSync(path.join(configRoot, "results"))
    const write = (name: string, body: unknown) =>
      fs.writeFileSync(
        path.join(configRoot, `results/${name}.json`),
        JSON.stringify(body),
      )
    write("old", { id: "old", subject: "o", date: "2024-01-01", players: [] })
    write("new", { id: "new", subject: "n", date: "2026-01-01", players: [] })
    write("nodate", { id: "nodate", subject: "d", players: [1] })
    write("copy", { id: "abc", subject: "c", date: "2025-01-01" })
    fs.writeFileSync(path.join(configRoot, "results/corrupt.json"), "{")

    const { getResultsMeta } = await import("@razzia/socket/services/config")
    const meta = getResultsMeta()

    expect(meta.map((m) => m.id)).toEqual(["new", "copy", "old", "nodate"])
    expect(meta.find((m) => m.id === "copy")?.playerCount).toBe(0)
  })
})
