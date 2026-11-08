import { detectImageMimeType } from "@razzia/common/utils/image-bytes"
import {
  BACKGROUND_UPLOAD_MAX_BYTES,
  contentTypeForExtension,
  extensionForMime,
} from "@razzia/common/utils/background-image"
import { backgroundAssetPathValidator } from "@razzia/common/validators/visuals"
import type { GameConfig } from "@razzia/common/validators/game-config"
import type { Quizz } from "@razzia/common/types/game"
import {
  DEFAULT_SHOW_INTENSITY,
  DEFAULT_SOUND_THEME,
  type BackgroundRef,
  type ResolvedVisuals,
} from "@razzia/common/types/visuals"
import {
  getConfigPath,
  getGameConfig,
  getReferencedBackgroundAssetPaths,
  updateGameConfig,
} from "@razzia/socket/services/config"
import fs from "fs"
import type { IncomingMessage, ServerResponse } from "http"
import { nanoid } from "nanoid"
import { extname } from "path"
import { publicErrorMessage } from "@razzia/socket/utils/safe"

export const BACKGROUND_ASSETS_CONFIG_PATH = "assets/backgrounds"

export const BACKGROUND_ASSETS_PUBLIC_PREFIX = "/config-assets/backgrounds"

export const BACKGROUND_ORPHAN_GRACE_MS = 60 * 60 * 1000

const pendingBackgroundAssetPaths = new Set<string>()

// Backgrounds a running game still shows. Its url was resolved when the game
// was created, so the saved config no longer vouches for it once the manager
// replaces or clears that background mid-game.
let liveBackgroundPathsProvider: () => Iterable<string> = () => []

export const setLiveBackgroundPathsProvider = (
  provider: () => Iterable<string>,
): void => {
  liveBackgroundPathsProvider = provider
}

export { BACKGROUND_UPLOAD_MAX_BYTES }

export const ensureBackgroundAssetsDirectory = () => {
  fs.mkdirSync(getConfigPath(BACKGROUND_ASSETS_CONFIG_PATH), {
    recursive: true,
  })
}

export const getBackgroundAssetPath = (path: string): string | null => {
  const result = backgroundAssetPathValidator.safeParse(path)

  if (!result.success) {
    return null
  }

  return getConfigPath(`${BACKGROUND_ASSETS_CONFIG_PATH}/${result.data}`)
}

export const publicBackgroundUrl = (path: string): string =>
  `${BACKGROUND_ASSETS_PUBLIC_PREFIX}/${encodeURIComponent(path)}`

// The inverse of publicBackgroundUrl: undefined for anything that is not a
// valid background url.
export const backgroundPathFromUrl = (url: unknown): string | undefined => {
  const prefix = `${BACKGROUND_ASSETS_PUBLIC_PREFIX}/`

  if (typeof url !== "string" || !url.startsWith(prefix)) {
    return undefined
  }

  let decoded = ""

  try {
    decoded = decodeURIComponent(url.slice(prefix.length))
  } catch {
    return undefined
  }

  const result = backgroundAssetPathValidator.safeParse(decoded)

  return result.success ? result.data : undefined
}

export const getBackgroundAssetUrl = (
  background?: BackgroundRef,
): string | undefined => {
  if (background?.kind !== "config-asset") {
    return undefined
  }

  const assetPath = getBackgroundAssetPath(background.path)

  if (!assetPath || !fs.existsSync(assetPath)) {
    return undefined
  }

  return publicBackgroundUrl(background.path)
}

export const storeBackgroundAsset = (
  fileName: string,
  data: Buffer,
): { ref: BackgroundRef; url: string } => {
  if (data.byteLength === 0) {
    throw new Error("errors:visuals.emptyBackground")
  }

  if (data.byteLength > BACKGROUND_UPLOAD_MAX_BYTES) {
    throw new Error("errors:visuals.backgroundTooLarge")
  }

  const sniffed = detectImageMimeType(data)
  const extension = sniffed ? extensionForMime(sniffed) : undefined

  if (!sniffed || !extension) {
    throw new Error("errors:visuals.unsupportedBackgroundType")
  }

  ensureBackgroundAssetsDirectory()

  const id = nanoid(16)
  const safeBase = fileName
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-z0-9_-]/gi, "-")
  const path = `${safeBase ? `${safeBase.slice(0, 40)}-` : ""}${id}.${extension}`
  const filePath = getBackgroundAssetPath(path)

  if (!filePath) {
    throw new Error("errors:visuals.invalidBackgroundPath")
  }

  fs.writeFileSync(filePath, data)
  pendingBackgroundAssetPaths.add(path)

  return {
    ref: { kind: "config-asset", path },
    url: publicBackgroundUrl(path),
  }
}

export const deleteBackgroundAsset = (background: BackgroundRef): void => {
  const filePath = getBackgroundAssetPath(background.path)

  if (!filePath || !fs.existsSync(filePath)) {
    return
  }

  const stat = fs.lstatSync(filePath)

  if (stat.isSymbolicLink() || !stat.isFile()) {
    return
  }

  fs.unlinkSync(filePath)
  pendingBackgroundAssetPaths.delete(background.path)
}

export interface BackgroundReclaimResult {
  examined: number
  deleted: number
  retained: number
}

export interface BackgroundReclaimOptions {
  candidates?: Iterable<string>
  minimumAgeMs: number
  preserve?: ReadonlySet<string>
}

export const reclaimBackgroundAssets = ({
  candidates,
  minimumAgeMs,
  preserve = new Set<string>(),
}: BackgroundReclaimOptions): BackgroundReclaimResult => {
  const referenced = getReferencedBackgroundAssetPaths()
  const live = (() => {
    try {
      return new Set(liveBackgroundPathsProvider())
    } catch (error) {
      // Cannot tell what a running game shows: keep every file.
      console.warn("Failed to list live game backgrounds:", error)

      return null
    }
  })()
  const assetsDirectory = getConfigPath(BACKGROUND_ASSETS_CONFIG_PATH)

  if (!fs.existsSync(assetsDirectory)) {
    return { examined: 0, deleted: 0, retained: 0 }
  }

  if (!live) {
    const candidateCount = new Set(
      candidates ?? fs.readdirSync(assetsDirectory),
    ).size

    return { examined: candidateCount, deleted: 0, retained: candidateCount }
  }

  const candidatePaths = [
    ...new Set(candidates ?? fs.readdirSync(assetsDirectory)),
  ].sort()
  const result: BackgroundReclaimResult = {
    examined: candidatePaths.length,
    deleted: 0,
    retained: 0,
  }

  for (const candidate of candidatePaths) {
    const validated = backgroundAssetPathValidator.safeParse(candidate)

    if (!validated.success) {
      result.retained += 1

      continue
    }

    const assetPath = getBackgroundAssetPath(validated.data)

    if (
      !assetPath ||
      referenced.has(validated.data) ||
      live.has(validated.data) ||
      preserve.has(validated.data)
    ) {
      result.retained += 1

      continue
    }

    const stat = (() => {
      try {
        return fs.lstatSync(assetPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn(
            `Failed to inspect background asset "${candidate}":`,
            error,
          )
        }

        return null
      }
    })()

    if (!stat) {
      result.retained += 1

      continue
    }

    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      (minimumAgeMs > 0 && Date.now() - stat.mtimeMs < minimumAgeMs)
    ) {
      result.retained += 1

      continue
    }

    try {
      fs.unlinkSync(assetPath)
      pendingBackgroundAssetPaths.delete(validated.data)

      result.deleted += 1
    } catch (error) {
      console.warn(`Failed to reclaim background asset "${candidate}":`, error)
      result.retained += 1
    }
  }

  return result
}

const reclaimWithoutFailingMutation = (
  options: BackgroundReclaimOptions,
): BackgroundReclaimResult => {
  try {
    return reclaimBackgroundAssets(options)
  } catch (error) {
    console.warn("Failed to reclaim background assets:", error)

    return { examined: 0, deleted: 0, retained: 0 }
  }
}

export const finalizeBackgroundMutation = (
  previous: BackgroundRef | undefined,
  adopted?: BackgroundRef,
): BackgroundReclaimResult => {
  if (adopted?.kind === "config-asset") {
    pendingBackgroundAssetPaths.delete(adopted.path)
  }

  if (!previous || previous.path === adopted?.path) {
    return { examined: 0, deleted: 0, retained: 0 }
  }

  return reclaimWithoutFailingMutation({
    candidates: [previous.path],
    minimumAgeMs: 0,
  })
}

export const sweepBackgroundAssets = (): BackgroundReclaimResult =>
  reclaimWithoutFailingMutation({
    minimumAgeMs: BACKGROUND_ORPHAN_GRACE_MS,
    preserve: pendingBackgroundAssetPaths,
  })

export const cleanupBackgroundAssetsOnStartup = (): BackgroundReclaimResult =>
  reclaimWithoutFailingMutation({ minimumAgeMs: 0 })

export const setGlobalBackground = (background: BackgroundRef): GameConfig => {
  const assetPath = getBackgroundAssetPath(background.path)

  if (!assetPath || !fs.existsSync(assetPath)) {
    throw new Error("errors:visuals.invalidBackgroundPath")
  }

  const previous = getGameConfig().visuals?.background

  const next = updateGameConfig((config) => ({
    ...config,
    visuals: {
      ...config.visuals,
      background,
    },
  }))

  finalizeBackgroundMutation(previous, background)

  return next
}

export const clearGlobalBackground = (): GameConfig => {
  const previous = getGameConfig().visuals?.background

  const next = updateGameConfig((config) => {
    const { background: _background, ...visuals } = config.visuals ?? {}

    return {
      ...config,
      visuals: Object.keys(visuals).length ? visuals : undefined,
    }
  })

  finalizeBackgroundMutation(previous)

  return next
}

export const resolveVisuals = (
  quizz: Pick<Quizz, "visuals"> | undefined,
  gameConfig: GameConfig,
): ResolvedVisuals => {
  const background =
    quizz?.visuals?.background ?? gameConfig.visuals?.background
  const backgroundUrl = getBackgroundAssetUrl(background)

  return {
    ...(backgroundUrl ? { backgroundUrl } : {}),
    soundTheme: gameConfig.visuals?.soundTheme ?? DEFAULT_SOUND_THEME,
    showIntensity: gameConfig.visuals?.showIntensity ?? DEFAULT_SHOW_INTENSITY,
  }
}

// Request targets like "//" or "http://" do not parse; the caller answers 400.
const parseRequestUrl = (request: IncomingMessage): URL | null => {
  try {
    return new URL(request.url ?? "", "http://localhost")
  } catch {
    return null
  }
}

const badRequest = (response: ServerResponse): true => {
  response.writeHead(400)
  response.end()

  return true
}

export const serveConfigAsset = (
  request: IncomingMessage,
  response: ServerResponse,
): boolean => {
  if (!request.url) {
    return false
  }

  const url = parseRequestUrl(request)

  if (!url) {
    return badRequest(response)
  }

  if (!url.pathname.startsWith(`${BACKGROUND_ASSETS_PUBLIC_PREFIX}/`)) {
    return false
  }

  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" })
    response.end()

    return true
  }

  let assetName = ""

  try {
    assetName = decodeURIComponent(
      url.pathname.slice(`${BACKGROUND_ASSETS_PUBLIC_PREFIX}/`.length),
    )
  } catch {
    response.writeHead(404)
    response.end()

    return true
  }

  const filePath = getBackgroundAssetPath(assetName)
  const isFile = (() => {
    try {
      return filePath ? fs.statSync(filePath).isFile() : false
    } catch {
      return false
    }
  })()

  if (!filePath || !isFile) {
    response.writeHead(404)
    response.end()

    return true
  }

  response.writeHead(200, {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type":
      contentTypeForExtension(extname(filePath)) ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  })

  // Piping forwards neither errors nor an early close: without these a file
  // removed mid-open crashes the process and an aborted download leaks its fd.
  const stream = fs.createReadStream(filePath)

  stream.on("error", (error) => {
    console.warn("Failed to stream background asset:", error)
    stream.destroy()
    response.destroy()
  })
  response.on("close", () => {
    stream.destroy()
  })
  stream.pipe(response)

  return true
}

const readRequestBody = (
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0

    request.on("data", (chunk: Buffer) => {
      total += chunk.length

      if (total > maxBytes) {
        reject(new Error("errors:visuals.backgroundTooLarge"))
        request.destroy()

        return
      }

      chunks.push(chunk)
    })
    request.on("end", () => resolve(Buffer.concat(chunks)))
    request.on("error", reject)
  })

export const serveBackgroundUpload = async (
  request: IncomingMessage,
  response: ServerResponse,
  isAuthorized: (_clientId: string) => boolean,
): Promise<boolean> => {
  if (!request.url) {
    return false
  }

  const url = parseRequestUrl(request)

  if (!url) {
    return badRequest(response)
  }

  if (url.pathname !== BACKGROUND_ASSETS_PUBLIC_PREFIX) {
    return false
  }

  if (request.method !== "POST") {
    response.writeHead(405, { Allow: "POST" })
    response.end()

    return true
  }

  const clientId = request.headers["x-client-id"]

  if (typeof clientId !== "string" || !isAuthorized(clientId)) {
    response.writeHead(401, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ error: "errors:manager.unauthorized" }))

    return true
  }

  let uploaded: ReturnType<typeof storeBackgroundAsset> | undefined = undefined

  try {
    const fileNameHeader = request.headers["x-file-name"]
    const fileName =
      typeof fileNameHeader === "string" && fileNameHeader.length > 0
        ? fileNameHeader
        : "background.png"
    const data = await readRequestBody(
      request,
      BACKGROUND_UPLOAD_MAX_BYTES + 1024,
    )
    uploaded = storeBackgroundAsset(fileName, data)

    if (url.searchParams.get("setGlobal") === "1") {
      setGlobalBackground(uploaded.ref)
    }

    sweepBackgroundAssets()

    response.writeHead(201, { "Content-Type": "application/json" })
    response.end(JSON.stringify(uploaded))
  } catch (error) {
    if (uploaded) {
      try {
        deleteBackgroundAsset(uploaded.ref)
      } catch (cleanupError) {
        console.error("Failed to clean up uploaded background:", cleanupError)
      }
    }

    console.error("Background upload failed:", error)

    // Filesystem errors carry absolute paths; only i18n keys go to the browser.
    const message = publicErrorMessage(
      error,
      "errors:visuals.backgroundUploadFailed",
    )

    response.writeHead(400, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ error: message }))
  }

  return true
}
