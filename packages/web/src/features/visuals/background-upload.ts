export const BACKGROUND_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

export const BACKGROUND_UPLOAD_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const

export type BackgroundFileValidation =
  | { ok: true }
  | { ok: false; error: string }

export const validateBackgroundFile = (
  file: File,
): BackgroundFileValidation => {
  if (
    !BACKGROUND_UPLOAD_ACCEPT.includes(
      file.type as (typeof BACKGROUND_UPLOAD_ACCEPT)[number],
    )
  ) {
    return { ok: false, error: "errors:visuals.unsupportedBackgroundType" }
  }

  if (file.size > BACKGROUND_UPLOAD_MAX_BYTES) {
    return { ok: false, error: "errors:visuals.backgroundTooLarge" }
  }

  return { ok: true }
}

export interface BackgroundUploadResult {
  ref: { kind: "config-asset"; path: string }
  url: string
}

export const uploadBackgroundViaHttp = async (
  file: File,
  clientId: string,
): Promise<BackgroundUploadResult> => {
  const validation = validateBackgroundFile(file)

  if (!validation.ok) {
    throw new Error(validation.error)
  }

  const response = await fetch("/config-assets/backgrounds", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Client-Id": clientId,
      "X-File-Name": file.name,
    },
    body: file,
  })

  const payload = (await response.json()) as
    | BackgroundUploadResult
    | { error: string }

  if (!response.ok || "error" in payload) {
    throw new Error(
      "error" in payload
        ? payload.error
        : "errors:visuals.backgroundUploadFailed",
    )
  }

  return payload
}
