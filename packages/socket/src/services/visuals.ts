import {
  detectImageMimeType,
  stripDataUrlBase64,
} from "@razzia/common/utils/image-bytes"
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

/** Socket traffic stays at the Socket.IO default; large backgrounds use HTTP. */
export const SOCKET_MAX_HTTP_BUFFER_SIZE = 1 * 1024 * 1024

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
  const normalizedBase64 = stripDataUrlBase64(dataBase64)
  const data = Buffer.from(normalizedBase64, "base64")

  if (data.byteLength === 0) {
    throw new Error("errors:visuals.emptyBackground")
  }

  if (data.byteLength > BACKGROUND_UPLOAD_MAX_BYTES) {
    throw new Error("errors:visuals.backgroundTooLarge")
  }

  const sniffed = detectImageMimeType(data)

  if (!sniffed || !(sniffed in extensionsByMimeType)) {
    throw new Error("errors:visuals.unsupportedBackgroundType")
  }

  if (mimeType && mimeType !== sniffed) {
    throw new Error("errors:visuals.unsupportedBackgroundType")
  }

  const extension = extensionsByMimeType[sniffed]

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

export const storeBackgroundAssetFromBytes = (
  fileName: string,
  data: Buffer,
  claimedMimeType?: string,
): { ref: BackgroundRef; url: string } =>
  storeBackgroundAsset({
    fileName,
    mimeType: claimedMimeType ?? detectImageMimeType(data) ?? "",
    dataBase64: data.toString("base64"),
  })

export const deleteBackgroundAsset = (background: BackgroundRef): void => {
  const filePath = getBackgroundAssetPath(background.path)

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return
  }

  fs.unlinkSync(filePath)
}

export const replaceBackgroundAsset = (
  previous: BackgroundRef | undefined,
  request: StoreBackgroundAssetRequest,
): { ref: BackgroundRef; url: string } => {
  const uploaded = storeBackgroundAsset(request)

  if (previous && previous.path !== uploaded.ref.path) {
    try {
      deleteBackgroundAsset(previous)
    } catch (error) {
      console.error("Failed to delete previous background asset:", error)
    }
  }

  return uploaded
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

  try {
    const fileNameHeader = request.headers["x-file-name"]
    const fileName =
      typeof fileNameHeader === "string" && fileNameHeader.length > 0
        ? fileNameHeader
        : "background.png"
    const claimedMime =
      typeof request.headers["content-type"] === "string"
        ? request.headers["content-type"].split(";")[0].trim()
        : undefined
    const data = await readRequestBody(
      request,
      BACKGROUND_UPLOAD_MAX_BYTES + 1024,
    )
    const uploaded = storeBackgroundAssetFromBytes(fileName, data, claimedMime)

    response.writeHead(201, { "Content-Type": "application/json" })
    response.end(JSON.stringify(uploaded))
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "errors:visuals.backgroundUploadFailed"

    response.writeHead(400, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ error: message }))
  }

  return true
}
