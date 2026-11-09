import type {
  SceneOptions,
  Score,
  ScoreConfig,
} from "@razzia/web/features/game/audio/controller"
import type { Lane } from "@razzia/web/features/game/audio/music"
import { score } from "@razzia/web/features/game/audio/score"
import {
  answersSpec,
  BOARD_REORDER_S,
  type Cue,
  type Intensity,
  originMs,
  PODIUM_T,
  readingSpec,
  RISE_CAP,
  type SceneName,
  type SceneSpec,
  type Surface,
  unlockStamp,
  VERDICT_T,
  type VerdictOutcome,
  verdictOf,
  verdictSpec,
} from "@razzia/web/features/game/audio/scenes"
import {
  useScoreConfig,
  useScoreRound,
} from "@razzia/web/features/game/audio/use-score"

export {
  answersSpec,
  BOARD_REORDER_S,
  originMs,
  PODIUM_T,
  readingSpec,
  RISE_CAP,
  score,
  unlockStamp,
  useScoreConfig,
  useScoreRound,
  VERDICT_T,
  verdictOf,
  verdictSpec,
}

export type {
  Cue,
  Intensity,
  Lane,
  SceneName,
  SceneOptions,
  SceneSpec,
  Score,
  ScoreConfig,
  Surface,
  VerdictOutcome,
}
