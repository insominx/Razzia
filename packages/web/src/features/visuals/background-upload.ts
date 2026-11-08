import {
  BACKGROUND_UPLOAD_MAX_BYTES,
  BACKGROUND_UPLOAD_MIME_TYPES,
  isBackgroundImageMime,
} from "@razzia/common/utils/background-image"
import type { BackgroundUploadResponse } from "@razzia/common/types/manager"

export { BACKGROUND_UPLOAD_MAX_BYTES }

export const BACKGROUND_UPLOAD_ACCEPT = BACKGROUND_UPLOAD_MIME_TYPES

export type BackgroundFileValidation =
  | { ok: true }
  | { ok: false; error: string }

export const validateBackgroundFile = (
  file: File,
): BackgroundFileValidation => {
  if (!isBackgroundImageMime(file.type)) {
    return { ok: false, error: "errors:visuals.unsupportedBackgroundType" }
  }

  if (file.size > BACKGROUND_UPLOAD_MAX_BYTES) {
    return { ok: false, error: "errors:visuals.backgroundTooLarge" }
  }

  return { ok: true }
}

const UPLOAD_FAILED = "errors:visuals.backgroundUploadFailed"

export const toHeaderSafeName = (name: string): string =>
  // oxlint-disable-next-line no-control-regex
  name.replace(/[^ -~]/gu, "-")

export const uploadBackgroundViaHttp = async (
  file: File,
  clientId: string,
  options: { setGlobal?: boolean } = {},
): Promise<BackgroundUploadResponse> => {
  const validation = validateBackgroundFile(file)

  if (!validation.ok) {
    throw new Error(validation.error)
  }

  const url = options.setGlobal
    ? "/config-assets/backgrounds?setGlobal=1"
    : "/config-assets/backgrounds"

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Client-Id": clientId,
      // Header values must be Latin-1, so a name like "фото.jpg" would make
      // fetch throw. The server only reads a sanitised base name from it.
      "X-File-Name": toHeaderSafeName(file.name),
    },
    body: file,
  }).catch(() => {
    throw new Error(UPLOAD_FAILED)
  })

  // A proxy answers an unreachable upstream with an HTML page, not JSON.
  let payload: BackgroundUploadResponse | { error: string } | null = null

  try {
    payload = (await response.json()) as
      | BackgroundUploadResponse
      | { error: string }
  } catch {
    payload = null
  }

  if (!payload || typeof payload !== "object") {
    throw new Error(UPLOAD_FAILED)
  }

  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error : UPLOAD_FAILED)
  }

  return payload
}
