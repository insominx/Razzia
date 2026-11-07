import { z } from "zod"
import {
  DEFAULT_DIALECT,
  DEFAULT_SHOW_INTENSITY,
  DEFAULT_SOUND_THEME,
  SHOW_INTENSITIES,
  SOUND_THEMES,
} from "@razzia/common/types/visuals"
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

export const soundThemeValidator = z.enum(SOUND_THEMES, {
  error: "errors:visuals.invalidSoundTheme",
})

export const showIntensityValidator = z.enum(SHOW_INTENSITIES, {
  error: "errors:visuals.invalidShowIntensity",
})

export const gameVisualsConfigValidator = visualsConfigValidator.extend({
  showIntensity: showIntensityValidator
    .catch(DEFAULT_SHOW_INTENSITY)
    .optional(),
  dialect: dialectValidator.catch(DEFAULT_DIALECT).optional(),
  soundTheme: soundThemeValidator.catch(DEFAULT_SOUND_THEME).optional(),
})
