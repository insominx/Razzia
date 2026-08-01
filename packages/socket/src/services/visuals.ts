import { detectImageMimeType } from "@razzia/common/utils/image-bytes"
import {
  BACKGROUND_UPLOAD_MAX_BYTES,
  contentTypeForExtension,
  extensionForMime,
} from "@razzia/common/utils/background-image"
import { backgroundAssetPathValidator } from "@razzia/common/validators/visuals"
import type { GameConfig } from "@razzia/common/validators/game-config"
import type { Quizz } from "@razzia/common/types/game"
import type {
  BackgroundRef,
  ResolvedVisuals,
} from "@razzia/common/types/visuals"
import {
  getConfigPath,
  updateGameConfig,
} from "@razzia/socket/services/config"
import fs from "fs"
import type { IncomingMessage, ServerResponse } from "http"
import { nanoid } from "nanoid"
import { extname } from "path"

export const BACKGROUND_ASSETS_CONFIG_PATH = "assets/backgrounds"

export const BACKGROUND_ASSETS_PUBLIC_PREFIX = "/config-assets/backgrounds"

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
  const safeBase = fileName.replace(/\.[^.]*$/, "").replace(/[^a-z0-9_-]/gi, "-")
  const path = `${safeBase ? `${safeBase.slice(0, 40)}-` : ""}${id}.${extension}`
  const filePath = getBackgroundAssetPath(path)

  if (!filePath) {
    throw new Error("errors:visuals.invalidBackgroundPath")
  }

  fs.writeFileSync(filePath, data)

  return {
    ref: { kind: "config-asset", path },
    url: publicBackgroundUrl(path),
  }
}

export const deleteBackgroundAsset = (background: BackgroundRef): void => {
  const filePath = getBackgroundAssetPath(background.path)

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return
  }

  fs.unlinkSync(filePath)
}

export const setGlobalBackground = (
  background: BackgroundRef,
): GameConfig => {
  const assetPath = getBackgroundAssetPath(background.path)

  if (!assetPath || !fs.existsSync(assetPath)) {
    throw new Error("errors:visuals.invalidBackgroundPath")
  }

  let previous: BackgroundRef | undefined

  const next = updateGameConfig((config) => {
    previous = config.visuals?.background

    return {
      ...config,
      visuals: {
        ...config.visuals,
        background,
      },
    }
  })

  if (previous && previous.path !== background.path) {
    deleteBackgroundAsset(previous)
  }

  return next
}

export const clearGlobalBackground = (): GameConfig => {
  let previous: BackgroundRef | undefined

  const next = updateGameConfig((config) => {
    previous = config.visuals?.background
    const { background: _background, ...visuals } = config.visuals ?? {}

    return {
      ...config,
      visuals: Object.keys(visuals).length ? visuals : undefined,
    }
  })

  if (previous) {
    deleteBackgroundAsset(previous)
  }

  return next
}

export const resolveVisuals = (
  quizz: Pick<Quizz, "visuals"> | undefined,
  gameConfig: GameConfig,
): ResolvedVisuals => {
  const background = quizz?.visuals?.background ?? gameConfig.visuals?.background
  const backgroundUrl = getBackgroundAssetUrl(background)

  return backgroundUrl ? { backgroundUrl } : {}
}

export const serveConfigAsset = (
  request: IncomingMessage,
  response: ServerResponse,
): boolean => {
  if (!request.url) {
    return false
  }

  const url = new URL(request.url, "http://localhost")

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

  if (
    !filePath ||
    !fs.existsSync(filePath) ||
    !fs.statSync(filePath).isFile()
  ) {
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
  fs.createReadStream(filePath).pipe(response)

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

  const url = new URL(request.url, "http://localhost")

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

  let uploaded: ReturnType<typeof storeBackgroundAsset> | undefined

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

    const message =
      error instanceof Error
        ? error.message
        : "errors:visuals.backgroundUploadFailed"

    response.writeHead(400, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ error: message }))
  }

  return true
}
