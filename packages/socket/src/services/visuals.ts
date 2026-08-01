import { backgroundAssetPathValidator } from "@razzia/common/validators/visuals"
import type { GameConfig } from "@razzia/common/validators/game-config"
import type { Quizz } from "@razzia/common/types/game"
import type {
  BackgroundRef,
  ResolvedVisuals,
} from "@razzia/common/types/visuals"
import { getConfigPath } from "@razzia/socket/services/config"
import fs from "fs"
import type { IncomingMessage, ServerResponse } from "http"
import { nanoid } from "nanoid"
import { extname } from "path"

export const BACKGROUND_ASSETS_CONFIG_PATH = "assets/backgrounds"

export const CONFIG_ASSETS_PUBLIC_PREFIX = "/config-assets"

export const BACKGROUND_ASSETS_PUBLIC_PREFIX = `${CONFIG_ASSETS_PUBLIC_PREFIX}/backgrounds`

export const BACKGROUND_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

export const SOCKET_MAX_HTTP_BUFFER_SIZE = 8 * 1024 * 1024

const contentTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}

const extensionsByMimeType: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export interface StoreBackgroundAssetRequest {
  fileName: string
  mimeType: string
  dataBase64: string
}

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

  return `${BACKGROUND_ASSETS_PUBLIC_PREFIX}/${encodeURIComponent(background.path)}`
}

export const storeBackgroundAsset = ({
  fileName,
  mimeType,
  dataBase64,
}: StoreBackgroundAssetRequest): { ref: BackgroundRef; url: string } => {
  const extension = extensionsByMimeType[mimeType]

  if (!extension) {
    throw new Error("errors:visuals.unsupportedBackgroundType")
  }

  const normalizedBase64 = dataBase64.includes(",")
    ? dataBase64.slice(dataBase64.indexOf(",") + 1)
    : dataBase64

  const data = Buffer.from(normalizedBase64, "base64")

  if (data.byteLength === 0) {
    throw new Error("errors:visuals.emptyBackground")
  }

  if (data.byteLength > BACKGROUND_UPLOAD_MAX_BYTES) {
    throw new Error("errors:visuals.backgroundTooLarge")
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

  const ref: BackgroundRef = { kind: "config-asset", path }
  const url = getBackgroundAssetUrl(ref)

  if (!url) {
    fs.unlinkSync(filePath)
    throw new Error("errors:visuals.backgroundUploadFailed")
  }

  return { ref, url }
}

export const deleteBackgroundAsset = (background: BackgroundRef): void => {
  const filePath = getBackgroundAssetPath(background.path)

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return
  }

  fs.unlinkSync(filePath)
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
      contentTypes[extname(filePath).toLowerCase()] ??
      "application/octet-stream",
  })
  fs.createReadStream(filePath).pipe(response)

  return true
}
