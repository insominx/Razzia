import type { GameResultMeta, QuizzMeta } from "@razzia/common/types/game"
import type {
  BackgroundRef,
  GameVisualsConfig,
  ResolvedVisuals,
} from "@razzia/common/types/visuals"

export interface ManagerConfig {
  quizz: QuizzMeta[]
  results: GameResultMeta[]
  game: {
    visuals?: GameVisualsConfig
    resolvedVisuals: ResolvedVisuals
  }
}

export interface BackgroundUploadResponse {
  ref: BackgroundRef
  url: string
}

export type ManagerMutationResponse = { ok: true } | { error: string }
