import { EXAMPLE_QUIZZ } from "@razzia/common/constants"
import {
  type GameConfig,
  gameConfigValidator,
} from "@razzia/common/validators/game-config"
import type {
  GameResult,
  GameResultMeta,
  QuizzMeta,
  QuizzWithId,
} from "@razzia/common/types/game"
import type { BackgroundRef } from "@razzia/common/types/visuals"
import {
  type QuizzValidated,
  quizzValidator,
} from "@razzia/common/validators/quizz"
import { normalizeFilename } from "@razzia/socket/utils/game"
import { isSafeId, ItemNotFoundError } from "@razzia/socket/utils/safe"
import { backgroundAssetPathValidator } from "@razzia/common/validators/visuals"
import { createHash } from "node:crypto"
import fs from "fs"
import { join, resolve } from "path"

// Write to a sibling temp file and rename over the target, so a crash or a
// full disk never leaves a truncated JSON file behind.
const writeFileAtomic = (path: string, data: string, mode?: number): void => {
  const tempPath = `${path}.${process.pid}.tmp`

  try {
    fs.writeFileSync(tempPath, data, mode === undefined ? {} : { mode })
    fs.renameSync(tempPath, path)
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true })
    } catch {
      // The original error is the one worth reporting.
    }

    throw error
  }
}

// Notepad and PowerShell can save a UTF-8 BOM, which JSON.parse rejects.
const readJsonFile = (path: string): unknown =>
  JSON.parse(fs.readFileSync(path, "utf-8").replace(/^\uFEFF/, ""))

const assertSafeId = (id: string): void => {
  if (!isSafeId(id)) {
    throw new Error("Invalid id")
  }
}

export const getConfigPath = (path = "") => {
  const configRoot = process.env.CONFIG_PATH

  return configRoot
    ? resolve(configRoot, path)
    : resolve(process.cwd(), "../../config", path)
}

// Without CONFIG_PATH the folder is "../../config" from the working directory,
// which is only the project's when the server runs from packages/socket. From
// anywhere else it is some other folder, and creating a placeholder game.json
// there would answer every login with "password not configured" while the real
// file sits untouched. Creating is refused unless the folder is next to the
// workspace; one that already exists is used as it is.
const assertMayCreateConfig = () => {
  if (process.env.CONFIG_PATH) {
    return
  }

  const workspaceRoot = resolve(process.cwd(), "../..")

  if (!fs.existsSync(join(workspaceRoot, "pnpm-workspace.yaml"))) {
    throw new Error(
      `Refusing to create a config folder at ${getConfigPath()}: it is not inside the project. Set CONFIG_PATH, or start the server from packages/socket.`,
    )
  }
}

export const initConfig = () => {
  const isConfigFolderExists = fs.existsSync(getConfigPath())

  console.log(`Config folder: ${getConfigPath()}`)

  if (!isConfigFolderExists) {
    assertMayCreateConfig()
    fs.mkdirSync(getConfigPath())
  }

  const isGameConfigExists = fs.existsSync(getConfigPath("game.json"))

  if (!isGameConfigExists) {
    console.warn(
      `No game.json in ${getConfigPath()}: creating one with the placeholder password. Logins stay refused until managerPassword is set there. If you already set it, the server is using the wrong config folder.`,
    )
    writeFileAtomic(
      getConfigPath("game.json"),
      JSON.stringify(
        {
          managerPassword: "PASSWORD",
        },
        null,
        2,
      ),
      0o600,
    )
  }

  const isQuizzExists = fs.existsSync(getConfigPath("quizz"))

  if (!isQuizzExists) {
    fs.mkdirSync(getConfigPath("quizz"))
  }

  if (syncSeedQuizzes()) {
    return
  }

  if (!isQuizzExists) {
    fs.writeFileSync(
      getConfigPath("quizz/example.json"),
      JSON.stringify(EXAMPLE_QUIZZ, null, 2),
    )
  }
}

const SEED_MANIFEST = ".seed-manifest.json"

const sha256 = (data: Buffer): string =>
  createHash("sha256").update(data).digest("hex")

// What the seeder last wrote, by file name. It lives beside game.json, not in
// quizz/, which lists every .json it holds as a quiz. A missing or unreadable
// manifest reads as empty, which keeps every volume quiz.
const readSeedManifest = (): Record<string, string> => {
  const path = getConfigPath(SEED_MANIFEST)

  if (!fs.existsSync(path)) {
    return {}
  }

  try {
    const parsed = readJsonFile(path) as { files?: Record<string, unknown> }
    const files: Record<string, string> = {}

    for (const [name, hash] of Object.entries(parsed.files ?? {})) {
      if (typeof hash === "string") {
        files[name] = hash
      }
    }

    return files
  } catch (error) {
    console.warn("Ignoring an unreadable quiz seed manifest:", error)

    return {}
  }
}

const writeSeedManifest = (files: Record<string, string>): void => {
  writeFileAtomic(
    getConfigPath(SEED_MANIFEST),
    JSON.stringify({ version: 1, files }, null, 2),
  )
}

const recordSeedHash = (file: string, hash: string): void => {
  try {
    writeSeedManifest({ ...readSeedManifest(), [file]: hash })
  } catch (error) {
    console.error("Could not write the quiz seed manifest:", error)
  }
}

// The volume is the source of truth; the quizzes baked into the image only add
// to it. A seeded quiz is replaced only while it is byte-identical to what the
// seeder last wrote, so a quiz edited in the manager survives every restart.
// Nothing is ever deleted. Returns true when the seed had quizzes to offer.
const syncSeedQuizzes = (): boolean => {
  const seedDir = process.env.QUIZ_SEED_PATH

  if (!seedDir || !fs.existsSync(seedDir)) {
    return false
  }

  const seeds = new Map<string, Buffer>()

  for (const file of fs
    .readdirSync(seedDir)
    .filter((name) => name.endsWith(".json"))) {
    try {
      const data = fs.readFileSync(join(seedDir, file))

      if (
        quizzValidator.safeParse(
          JSON.parse(data.toString("utf-8").replace(/^﻿/, "")),
        ).success
      ) {
        seeds.set(file, data)
      }
    } catch {
      continue
    }
  }

  if (seeds.size === 0) {
    return false
  }

  const destDir = getConfigPath("quizz")
  fs.mkdirSync(destDir, { recursive: true })

  const recorded = readSeedManifest()
  const next: Record<string, string> = { ...recorded }
  let changed = false

  for (const [file, seed] of seeds) {
    const seedHash = sha256(seed)
    const target = join(destDir, file)

    try {
      if (!fs.existsSync(target)) {
        writeFileAtomic(target, seed.toString("utf-8"))
        next[file] = seedHash
        changed = true

        continue
      }

      const volumeHash = sha256(fs.readFileSync(target))

      if (volumeHash === seedHash) {
        if (next[file] !== seedHash) {
          next[file] = seedHash
          changed = true
        }
      } else if (recorded[file] === volumeHash) {
        writeFileAtomic(target, seed.toString("utf-8"))
        next[file] = seedHash
        changed = true
      } else {
        console.warn(
          `Kept the edited copy of quiz "${file}"; the committed version differs.`,
        )
      }
    } catch (error) {
      console.error(`Could not seed quiz "${file}":`, error)
    }
  }

  if (changed) {
    try {
      writeSeedManifest(next)
    } catch (error) {
      console.error("Could not write the quiz seed manifest:", error)
    }
  }

  return true
}

export const getGameConfig = (): GameConfig => {
  const isExists = fs.existsSync(getConfigPath("game.json"))

  if (!isExists) {
    throw new Error("Game config not found")
  }

  const raw = (() => {
    try {
      return readJsonFile(getConfigPath("game.json"))
    } catch {
      throw new Error("Game config is not valid JSON")
    }
  })()

  const result = gameConfigValidator.safeParse(raw)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  return result.data
}

export const writeGameConfig = (data: GameConfig): void => {
  const result = gameConfigValidator.safeParse(data)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  writeFileAtomic(
    getConfigPath("game.json"),
    JSON.stringify(result.data, null, 2),
    0o600,
  )
}

export const updateGameConfig = (
  updater: (_config: GameConfig) => GameConfig,
): GameConfig => {
  const next = updater(getGameConfig())

  writeGameConfig(next)

  return next
}

// Key order and defaults must not make two identical quizzes look different.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, val: unknown) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val).sort(([x], [y]) => x.localeCompare(y)),
        )
      : val,
  )

// The copy of a quizz shipped with this server, when there is one.
const readSeedQuizz = (id: string) => {
  const seedDir = process.env.QUIZ_SEED_PATH

  if (!seedDir || !isSafeId(id)) {
    return null
  }

  const path = join(seedDir, `${id}.json`)

  try {
    if (!fs.existsSync(path)) {
      return null
    }

    const bytes = fs.readFileSync(path)
    const parsed = quizzValidator.safeParse(
      JSON.parse(bytes.toString("utf-8").replace(/^﻿/, "")),
    )

    return parsed.success ? { bytes, quizz: parsed.data } : null
  } catch {
    return null
  }
}

export const getQuizzMeta = (): QuizzMeta[] =>
  getQuizz().map(({ id, subject, questions, ...rest }) => {
    const seed = readSeedQuizz(id)
    const meta: QuizzMeta = { id, subject, questionCount: questions.length }

    if (seed) {
      meta.seedState =
        canonical({ subject, questions, ...rest }) === canonical(seed.quizz)
          ? "committed"
          : "edited"
    }

    return meta
  })

// Replaces a quizz's current content with the copy shipped with this server.
export const restoreCommittedQuizz = (id: string): QuizzBackgroundMutation => {
  assertSafeId(id)
  const seed = readSeedQuizz(id)

  if (!seed) {
    throw new Error("errors:quizz.noCommittedVersion")
  }

  const path = getConfigPath(`quizz/${id}.json`)

  if (!fs.existsSync(path)) {
    throw new ItemNotFoundError(`Quizz "${id}" not found`)
  }

  const previous = readPreviousQuizzFile(path, `${id}.json`)

  assertBackgroundExists(seed.quizz.visuals?.background, previous)
  writeFileAtomic(path, seed.bytes.toString("utf-8"))
  // Untouched again: a later committed change reaches it on the next start.
  recordSeedHash(`${id}.json`, sha256(seed.bytes))

  return {
    id,
    previousBackground: previous?.visuals?.background,
    background: seed.quizz.visuals?.background,
  }
}

const parseQuizzData = (data: unknown, label: string) => {
  const result = quizzValidator.safeParse(data)

  if (result.success) {
    return result.data
  }

  if (
    data &&
    typeof data === "object" &&
    "visuals" in data &&
    (data as { visuals?: unknown }).visuals !== undefined
  ) {
    const { visuals: _visuals, ...withoutVisuals } = data as {
      visuals?: unknown
    } & Record<string, unknown>
    const stripped = quizzValidator.safeParse(withoutVisuals)

    if (stripped.success) {
      console.warn(
        `Stripped invalid visuals from quizz "${label}":`,
        result.error.issues,
      )

      return stripped.data
    }
  }

  return null
}

// The quizz as it is on disk, for the background it holds. Invalid visuals are
// tolerated like the loaders do (they count as no background); a file that is
// not even JSON still throws so nothing is reclaimed on a guess.
const readPreviousQuizzFile = (
  filePath: string,
  label: string,
): QuizzValidated | undefined =>
  parseQuizzData(readJsonFile(filePath), label) ?? undefined

export const getReferencedBackgroundAssetPaths = (): Set<string> => {
  const references = new Set<string>()
  const gameBackground = getGameConfig().visuals?.background

  if (gameBackground) {
    references.add(gameBackground.path)
  }

  const quizzDirectory = getConfigPath("quizz")
  const files = fs
    .readdirSync(quizzDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        (entry.isFile() || entry.isSymbolicLink()) &&
        entry.name.endsWith(".json"),
    )
    .map((entry) => entry.name)
    .sort()

  for (const file of files) {
    // A quizz that fails validation is not listed, but a valid background
    // path it names is still kept until someone fixes or removes the file.
    const data = readJsonFile(getConfigPath(`quizz/${file}`))
    const quizz = parseQuizzData(data, file)
    const rawPath = (
      data as { visuals?: { background?: { path?: unknown } } } | null
    )?.visuals?.background?.path
    const rawValid = backgroundAssetPathValidator.safeParse(rawPath)
    const background = quizz?.visuals?.background

    if (background) {
      references.add(background.path)
    } else if (rawValid.success) {
      references.add(rawValid.data)
    }
  }

  return references
}

export interface QuizzBackgroundMutation {
  id: string
  previousBackground?: BackgroundRef
  background?: BackgroundRef
}

// A save may keep the reference it already had, but a new one must point at an
// uploaded file (a restart can have reclaimed an unsaved upload).
const assertBackgroundExists = (
  background: BackgroundRef | undefined,
  previous: QuizzValidated | undefined,
): void => {
  if (!background || previous?.visuals?.background?.path === background.path) {
    return
  }

  const exists = (() => {
    try {
      return fs
        .lstatSync(getConfigPath(`assets/backgrounds/${background.path}`))
        .isFile()
    } catch {
      return false
    }
  })()

  if (!exists) {
    throw new Error("errors:visuals.invalidBackgroundPath")
  }
}

export const getQuizzById = (id: string) => {
  assertSafeId(id)
  const filePath = getConfigPath(`quizz/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  const data = readJsonFile(filePath)
  const parsed = parseQuizzData(data, id)

  if (!parsed) {
    throw new Error(`Invalid quizz "${id}"`)
  }

  return { id, ...parsed }
}

export const getQuizz = () => {
  const isExists = fs.existsSync(getConfigPath("quizz"))

  if (!isExists) {
    return []
  }

  try {
    const files = fs
      .readdirSync(getConfigPath("quizz"))
      .filter((file) => file.endsWith(".json"))

    // One bad file is skipped; it must not hide every other quizz.
    const quizz: QuizzWithId[] = files.flatMap((file) => {
      try {
        const data = readJsonFile(getConfigPath(`quizz/${file}`))
        const id = file.slice(0, -".json".length)
        const parsed = isSafeId(id) ? parseQuizzData(data, file) : null

        if (!parsed) {
          console.warn(`Invalid quizz config "${file}"`)

          return []
        }

        return [{ id, ...parsed }]
      } catch (error) {
        console.warn(`Unreadable quizz config "${file}":`, error)

        return []
      }
    })

    return quizz
  } catch (error) {
    console.error("Failed to read quizz config:", error)

    return []
  }
}

export const updateQuizz = (
  id: string,
  data: unknown,
): QuizzBackgroundMutation => {
  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  assertSafeId(id)
  const oldPath = getConfigPath(`quizz/${id}.json`)

  if (!fs.existsSync(oldPath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  const previous = readPreviousQuizzFile(oldPath, `${id}.json`)

  assertBackgroundExists(result.data.visuals?.background, previous)
  writeFileAtomic(oldPath, JSON.stringify(result.data, null, 2))

  return {
    id,
    previousBackground: previous?.visuals?.background,
    background: result.data.visuals?.background,
  }
}

export const deleteQuizz = (id: string): QuizzBackgroundMutation => {
  assertSafeId(id)
  const filePath = getConfigPath(`quizz/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new ItemNotFoundError(`Quizz "${id}" not found`)
  }

  const previous = readPreviousQuizzFile(filePath, `${id}.json`)

  fs.unlinkSync(filePath)

  return { id, previousBackground: previous?.visuals?.background }
}

// Returns false when the write failed, so the caller can try again later.
export const saveResult = (data: GameResult): boolean => {
  try {
    assertSafeId(data.id)
    const resultsPath = getConfigPath("results")

    if (!fs.existsSync(resultsPath)) {
      fs.mkdirSync(resultsPath)
    }

    writeFileAtomic(
      getConfigPath(`results/${data.id}.json`),
      JSON.stringify(data, null, 2),
    )

    console.log(`Saved result for "${data.subject}"`)

    return true
  } catch (error) {
    console.error("Failed to save result:", error)

    return false
  }
}

const timeOf = (date: unknown): number => {
  const time = new Date(date as string).getTime()

  return Number.isNaN(time) ? 0 : time
}

export const getResultsMeta = (): GameResultMeta[] => {
  const resultsPath = getConfigPath("results")

  if (!fs.existsSync(resultsPath)) {
    return []
  }

  const readMeta = (file: string): GameResultMeta | null => {
    try {
      const id = file.slice(0, -".json".length)

      if (!isSafeId(id)) {
        return null
      }

      // The id is the file name: that is what get and delete resolve.
      const result = readJsonFile(
        getConfigPath(`results/${file}`),
      ) as GameResult

      return {
        id,
        subject: result.subject,
        date: result.date,
        playerCount: Array.isArray(result.players) ? result.players.length : 0,
      }
    } catch {
      return null
    }
  }

  try {
    return fs
      .readdirSync(resultsPath)
      .filter((file) => file.endsWith(".json"))
      .map(readMeta)
      .filter((meta): meta is GameResultMeta => meta !== null)
      .sort((a, b) => timeOf(b.date) - timeOf(a.date))
  } catch {
    return []
  }
}

export const getResultById = (id: string): GameResult => {
  assertSafeId(id)
  const filePath = getConfigPath(`results/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Result "${id}" not found`)
  }

  return readJsonFile(filePath) as GameResult
}

export const deleteResult = (id: string): void => {
  assertSafeId(id)
  const filePath = getConfigPath(`results/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new ItemNotFoundError(`Result "${id}" not found`)
  }

  fs.unlinkSync(filePath)
}

export const saveQuizz = (data: unknown): QuizzBackgroundMutation => {
  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  const id = normalizeFilename(result.data.subject)
  const filePath = getConfigPath(`quizz/${id}.json`)
  const previous = fs.existsSync(filePath)
    ? readPreviousQuizzFile(filePath, `${id}.json`)
    : undefined

  assertBackgroundExists(result.data.visuals?.background, previous)
  writeFileAtomic(filePath, JSON.stringify(result.data, null, 2))

  return {
    id,
    previousBackground: previous?.visuals?.background,
    background: result.data.visuals?.background,
  }
}
