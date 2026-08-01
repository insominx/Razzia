import { z } from "zod"
import { DEFAULT_DIALECT } from "@razzia/common/types/visuals"
import { BACKGROUND_IMAGE_EXTENSION_PATTERN } from "@razzia/common/utils/background-image"

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
      BACKGROUND_IMAGE_EXTENSION_PATTERN.test(path),
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
