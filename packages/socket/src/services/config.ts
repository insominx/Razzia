import { EXAMPLE_QUIZZ } from "@razzia/common/constants"
import {
  type GameConfig,
  gameConfigValidator,
} from "@razzia/common/validators/game-config"
import type {
  GameResult,
  GameResultMeta,
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

export const initConfig = () => {
  const isConfigFolderExists = fs.existsSync(getConfigPath())

  if (!isConfigFolderExists) {
    fs.mkdirSync(getConfigPath())
  }

  const isGameConfigExists = fs.existsSync(getConfigPath("game.json"))

  if (!isGameConfigExists) {
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

const syncSeedQuizzes = (): boolean => {
  const seedDir = process.env.QUIZ_SEED_PATH

  if (!seedDir || !fs.existsSync(seedDir)) {
    return false
  }

  const seedFiles = fs
    .readdirSync(seedDir)
    .filter((file) => file.endsWith(".json"))
  const valid: string[] = []

  for (const file of seedFiles) {
    try {
      const parsed = quizzValidator.safeParse(readJsonFile(join(seedDir, file)))

      if (parsed.success) {
        valid.push(file)
      }
    } catch {
      continue
    }
  }

  if (valid.length === 0) {
    return false
  }

  const destDir = getConfigPath("quizz")
  fs.mkdirSync(destDir, { recursive: true })

  for (const file of fs
    .readdirSync(destDir)
    .filter((name) => name.endsWith(".json"))) {
    fs.unlinkSync(join(destDir, file))
  }

  for (const file of valid) {
    fs.copyFileSync(join(seedDir, file), join(destDir, file))
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

export const getQuizzMeta = () =>
  getQuizz().map(({ id, subject, questions }) => ({
    id,
    subject,
    questionCount: questions.length,
  }))

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
