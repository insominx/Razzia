import { z } from "zod"
import { DEFAULT_DIALECT } from "@razzia/common/types/visuals"

const BACKGROUND_IMAGE_EXTENSION = /\.(gif|jpe?g|png|webp)$/i

export const BACKGROUND_UPLOAD_MIME_TYPES = [
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const

export const backgroundAssetPathValidator = z
  .string()
  .min(1, "errors:visuals.backgroundPathEmpty")
  .max(255, "errors:visuals.backgroundPathTooLong")
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.startsWith("\\") &&
      !path.includes("..") &&
      !path.includes("/") &&
      !path.includes("\\") &&
      !path.includes(":") &&
      !path.startsWith("config-assets") &&
      BACKGROUND_IMAGE_EXTENSION.test(path),
    "errors:visuals.invalidBackgroundPath",
  )

export const backgroundRefValidator = z.object({
  kind: z.literal("config-asset"),
  path: backgroundAssetPathValidator,
})

export const visualsConfigValidator = z.object({
  background: backgroundRefValidator.optional(),
})

export const dialectValidator = z.enum(["dark-everywhere", "stage-studio"], {
  error: "errors:visuals.invalidDialect",
})

export const gameVisualsConfigValidator = visualsConfigValidator.extend({
  dialect: dialectValidator.catch(DEFAULT_DIALECT).optional(),
})

export const backgroundUploadRequestValidator = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(BACKGROUND_UPLOAD_MIME_TYPES, {
    error: "errors:visuals.unsupportedBackgroundType",
  }),
  dataBase64: z.string().min(1, "errors:visuals.emptyBackground"),
})
