export interface BackgroundRef {
  kind: "config-asset"
  path: string
}

export interface VisualsConfig {
  background?: BackgroundRef
}

export type Dialect = "dark-everywhere" | "stage-studio"

export const DEFAULT_DIALECT: Dialect = "dark-everywhere"

export type SoundTheme = "classic" | "techno"

export const DEFAULT_SOUND_THEME: SoundTheme = "classic"

export const SOUND_THEMES = ["classic", "techno"] as const

export interface GameVisualsConfig extends VisualsConfig {
  dialect?: Dialect
  soundTheme?: SoundTheme
}

export interface ResolvedVisuals {
  backgroundUrl?: string
  soundTheme?: SoundTheme
}
