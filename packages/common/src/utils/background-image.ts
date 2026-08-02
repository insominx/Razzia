export const BACKGROUND_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

export const BACKGROUND_IMAGE_TYPES = [
  {
    mime: "image/png",
    extension: "png",
    contentType: "image/png",
  },
  {
    mime: "image/jpeg",
    extension: "jpg",
    contentType: "image/jpeg",
    altExtensions: ["jpeg"],
  },
  {
    mime: "image/webp",
    extension: "webp",
    contentType: "image/webp",
  },
  {
    mime: "image/gif",
    extension: "gif",
    contentType: "image/gif",
  },
] as const

export type BackgroundImageMime =
  (typeof BACKGROUND_IMAGE_TYPES)[number]["mime"]

export const BACKGROUND_UPLOAD_MIME_TYPES = BACKGROUND_IMAGE_TYPES.map(
  (entry) => entry.mime,
) as unknown as [BackgroundImageMime, ...BackgroundImageMime[]]

export const BACKGROUND_IMAGE_EXTENSION_PATTERN = /\.(gif|jpe?g|png|webp)$/i

export const extensionForMime = (mime: string): string | undefined =>
  BACKGROUND_IMAGE_TYPES.find((entry) => entry.mime === mime)?.extension

export const contentTypeForExtension = (ext: string): string | undefined => {
  const normalized = ext.startsWith(".")
    ? ext.slice(1).toLowerCase()
    : ext.toLowerCase()
  const jpeg = normalized === "jpeg" ? "jpg" : normalized

  return BACKGROUND_IMAGE_TYPES.find(
    (entry) =>
      entry.extension === jpeg ||
      ("altExtensions" in entry &&
        (entry.altExtensions as readonly string[] | undefined)?.includes(
          normalized,
        )),
  )?.contentType
}

export const isBackgroundImageMime = (
  mime: string,
): mime is BackgroundImageMime =>
  BACKGROUND_IMAGE_TYPES.some((entry) => entry.mime === mime)
