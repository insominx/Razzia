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
import fs from "fs"
import { resolve } from "path"

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
    fs.writeFileSync(
      getConfigPath("game.json"),
      JSON.stringify(
        {
          managerPassword: "PASSWORD",
        },
        null,
        2,
      ),
    )
  }

  const isQuizzExists = fs.existsSync(getConfigPath("quizz"))

  if (!isQuizzExists) {
    fs.mkdirSync(getConfigPath("quizz"))

    fs.writeFileSync(
      getConfigPath("quizz/example.json"),
      JSON.stringify(EXAMPLE_QUIZZ, null, 2),
    )
  }
}

export const getGameConfig = (): GameConfig => {
  const isExists = fs.existsSync(getConfigPath("game.json"))

  if (!isExists) {
    throw new Error("Game config not found")
  }

  const config = fs.readFileSync(getConfigPath("game.json"), "utf-8")
  const result = gameConfigValidator.safeParse(JSON.parse(config))

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

  fs.writeFileSync(
    getConfigPath("game.json"),
    JSON.stringify(result.data, null, 2),
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
  getQuizz().map(({ id, subject }) => ({ id, subject }))

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

const readStrictQuizzFile = (
  filePath: string,
  label: string,
): QuizzValidated => {
  const data: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"))
  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw new Error(`Invalid quizz config "${label}"`)
  }

  return result.data
}

export const getReferencedBackgroundAssetPaths = (): Set<string> => {
  const references = new Set<string>()
  const gameBackground = getGameConfig().visuals?.background

  if (gameBackground) {
    references.add(gameBackground.path)
  }

  const quizzDirectory = getConfigPath("quizz")
  const files = fs
    .readdirSync(quizzDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()

  for (const file of files) {
    const quizz = readStrictQuizzFile(getConfigPath(`quizz/${file}`), file)
    const background = quizz.visuals?.background

    if (background) {
      references.add(background.path)
    }
  }

  return references
}

export interface QuizzBackgroundMutation {
  id: string
  previousBackground?: BackgroundRef
  background?: BackgroundRef
}

export const getQuizzById = (id: string) => {
  const filePath = getConfigPath(`quizz/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  const data: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"))
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

    const quizz: QuizzWithId[] = files.flatMap((file) => {
      const data: unknown = JSON.parse(
        fs.readFileSync(getConfigPath(`quizz/${file}`), "utf-8"),
      )
      const id = file.replace(".json", "")
      const parsed = parseQuizzData(data, file)

      if (!parsed) {
        console.warn(`Invalid quizz config "${file}"`)

        return []
      }

      return [{ id, ...parsed }]
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

  const oldPath = getConfigPath(`quizz/${id}.json`)

  if (!fs.existsSync(oldPath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  const previous = readStrictQuizzFile(oldPath, `${id}.json`)

  fs.writeFileSync(oldPath, JSON.stringify(result.data, null, 2))

  return {
    id,
    previousBackground: previous.visuals?.background,
    background: result.data.visuals?.background,
  }
}

export const deleteQuizz = (id: string): QuizzBackgroundMutation => {
  const filePath = getConfigPath(`quizz/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Quizz "${id}" not found`)
  }

  const previous = readStrictQuizzFile(filePath, `${id}.json`)

  fs.unlinkSync(filePath)

  return { id, previousBackground: previous.visuals?.background }
}

export const saveResult = (data: GameResult): void => {
  try {
    const resultsPath = getConfigPath("results")

    if (!fs.existsSync(resultsPath)) {
      fs.mkdirSync(resultsPath)
    }

    fs.writeFileSync(
      getConfigPath(`results/${data.id}.json`),
      JSON.stringify(data, null, 2),
    )

    console.log(`Saved result for "${data.subject}"`)
  } catch (error) {
    console.error("Failed to save result:", error)
  }
}

export const getResultsMeta = (): GameResultMeta[] => {
  const resultsPath = getConfigPath("results")

  if (!fs.existsSync(resultsPath)) {
    return []
  }

  const readMeta = (file: string): GameResultMeta | null => {
    try {
      const data = fs.readFileSync(getConfigPath(`results/${file}`), "utf-8")
      const result = JSON.parse(data) as GameResult

      return {
        id: result.id,
        subject: result.subject,
        date: result.date,
        playerCount: result.players.length,
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
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  } catch {
    return []
  }
}

export const getResultById = (id: string): GameResult => {
  const filePath = getConfigPath(`results/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Result "${id}" not found`)
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as GameResult
}

export const deleteResult = (id: string): void => {
  const filePath = getConfigPath(`results/${id}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Result "${id}" not found`)
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
    ? readStrictQuizzFile(filePath, `${id}.json`)
    : undefined

  fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2))

  return {
    id,
    previousBackground: previous?.visuals?.background,
    background: result.data.visuals?.background,
  }
}
