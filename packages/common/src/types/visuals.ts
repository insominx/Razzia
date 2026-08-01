export interface BackgroundRef {
  kind: "config-asset"
  path: string
}

export interface VisualsConfig {
  background?: BackgroundRef
}

export type Dialect = "dark-everywhere" | "stage-studio"

export const DEFAULT_DIALECT: Dialect = "dark-everywhere"

export interface GameVisualsConfig extends VisualsConfig {
  dialect?: Dialect
}

export interface ResolvedVisuals {
  backgroundUrl?: string
}
