import { EVENTS } from "@razzia/common/constants"
import Answers from "@razzia/web/features/game/components/states/Answers"
import Leaderboard from "@razzia/web/features/game/components/states/Leaderboard"
import PlayerFinished from "@razzia/web/features/game/components/states/PlayerFinished"
import Podium from "@razzia/web/features/game/components/states/Podium"
import Prepared from "@razzia/web/features/game/components/states/Prepared"
import Question from "@razzia/web/features/game/components/states/Question"
import Responses from "@razzia/web/features/game/components/states/Responses"
import Result from "@razzia/web/features/game/components/states/Result"
import Room from "@razzia/web/features/game/components/states/Room"
import Start from "@razzia/web/features/game/components/states/Start"
import Wait from "@razzia/web/features/game/components/states/Wait"

import { STATUS, type StatusDataMap } from "@razzia/common/types/game/status"
import type { SoundTheme } from "@razzia/common/types/visuals"
import type { Status as GameStatus } from "@razzia/web/features/game/utils/createStatus"

/**
 * A–D tile recipe: accent stroke, tinted fill, accent ink. The ink role is
 * separate from the accent so the light register (studio surface) can darken
 * the letter without losing the vivid stroke.
 */
export const ANSWER_IDENTITY = [
  "border-answer-a bg-answer-a-tint text-answer-a-ink",
  "border-answer-b bg-answer-b-tint text-answer-b-ink",
  "border-answer-c bg-answer-c-tint text-answer-c-ink",
  "border-answer-d bg-answer-d-tint text-answer-d-ink",
] as const

/**
 * Solid A–D bar fill, no stroke and no tint. Only for marks whose *length*
 * carries the quantity — the reveal chart's bars — where a tint reads as empty
 * and a stroke reads as a frame around a track only a few pixels tall.
 */
export const ANSWER_BAR = [
  "bg-answer-a",
  "bg-answer-b",
  "bg-answer-c",
  "bg-answer-d",
] as const

/**
 * A–D numeral ink with no fill or stroke — for marks that sit *beside* the
 * swatch (the reveal chart's letter, percentage and count) and have to carry
 * identity through type alone.
 */
export const ANSWER_INK = [
  "text-answer-a-ink",
  "text-answer-b-ink",
  "text-answer-c-ink",
  "text-answer-d-ink",
] as const

export const ANSWERS_LABELS = ["A", "B", "C", "D"]

/**
 * Gold, silver and bronze for ranks 1–3 (index = rank − 1). Rank is the only
 * thing these colours mean; they never mark answers or correctness.
 */
export const MEDAL = [
  "bg-medal-gold border-medal-gold-border text-on-medal",
  "bg-medal-silver border-medal-silver-border text-on-medal",
  "bg-medal-bronze border-medal-bronze-border text-on-medal",
] as const

/**
 * Tracks for an A–D tile grid. Past the breakpoint the grid runs on four
 * tracks and every tile spans two, so an odd last tile (C of a three-answer
 * question) can start on track two and sit centred under the pair above it
 * instead of hanging off the left edge. Pair with `answerSlotPlacement`.
 *
 * `viewport` breaks at `sm` for full-width game screens; `container` breaks on
 * the nearest `@container` for tiles squeezed between editor panels.
 */
export const ANSWER_GRID_TRACKS = {
  viewport: "grid-cols-1 sm:grid-cols-4",
  container: "grid-cols-1 @xl:grid-cols-4",
} as const

type AnswerGridScope = keyof typeof ANSWER_GRID_TRACKS

const ANSWER_SLOT_PLACEMENT = {
  viewport: { pair: "sm:col-span-2", odd: "sm:col-span-2 sm:col-start-2" },
  container: { pair: "@xl:col-span-2", odd: "@xl:col-span-2 @xl:col-start-2" },
} as const

export const answerSlotPlacement = (
  index: number,
  count: number,
  scope: AnswerGridScope = "viewport",
): string =>
  count % 2 === 1 && index === count - 1
    ? ANSWER_SLOT_PLACEMENT[scope].odd
    : ANSWER_SLOT_PLACEMENT[scope].pair

export const GAME_STATES = {
  status: {
    name: STATUS.WAIT,
    data: { text: "Waiting for the players" },
  },
  question: {
    current: 1,
    total: null,
  },
}

export const GAME_STATE_COMPONENTS = {
  [STATUS.SELECT_ANSWER]: Answers,
  [STATUS.SHOW_QUESTION]: Question,
  [STATUS.WAIT]: Wait,
  [STATUS.SHOW_START]: Start,
  [STATUS.SHOW_RESULT]: Result,
  [STATUS.SHOW_PREPARED]: Prepared,
  [STATUS.FINISHED]: PlayerFinished,
}

export const GAME_STATE_COMPONENTS_MANAGER = {
  ...GAME_STATE_COMPONENTS,
  [STATUS.SHOW_ROOM]: Room,
  [STATUS.SHOW_RESPONSES]: Responses,
  [STATUS.SHOW_LEADERBOARD]: Leaderboard,
  [STATUS.FINISHED]: Podium,
}

export const SFX = {
  ANSWERS: {
    MUSIC: "/sounds/answersMusic.mp3",
    SOUND: "/sounds/answersSound.mp3",
  },
  PODIUM: {
    THREE: "/sounds/three.mp3",
    SECOND: "/sounds/second.mp3",
    FIRST: "/sounds/first.mp3",
    SNEAR_ROOL: "/sounds/snearRoll.mp3",
  },
  RESULTS_SOUND: "/sounds/results.mp3",
  SHOW_SOUND: "/sounds/show.mp3",
  BOUMP_SOUND: "/sounds/boump.mp3",
} as const

const THEMED_SFX_ROOT = "/sounds/themes"

/**
 * Basenames each non-classic pack actually ships. A cue that is absent here
 * falls back to the classic file, so a partial pack degrades instead of
 * letting Howler 404 into silence. `themed-sfx.test.ts` pins these lists to
 * the files under `public/sounds/themes/`.
 */
export const THEMED_SFX_FILES: Partial<Record<SoundTheme, readonly string[]>> =
  {
    techno: [
      "answersMusic.mp3",
      "answersSound.mp3",
      "boump.mp3",
      "show.mp3",
      "results.mp3",
      "three.mp3",
      "second.mp3",
      "snearRoll.mp3",
      "first.mp3",
    ],
  }

/**
 * Maps a classic cue path to its themed counterpart for the session theme.
 * Classic, undefined, and any cue the pack does not ship stay on the classic
 * path.
 */
export const sfxForTheme = (
  theme: SoundTheme | undefined,
  classicPath: string,
): string => {
  const pack = theme ? THEMED_SFX_FILES[theme] : undefined

  if (!pack) {
    return classicPath
  }

  const basename = classicPath.slice(classicPath.lastIndexOf("/") + 1)

  return pack.includes(basename)
    ? `${THEMED_SFX_ROOT}/${theme}/${basename}`
    : classicPath
}

/**
 * Classic-pack gain per cue, as tuned by ear. It is the reference mix every
 * other pack is levelled against, and it multiplies Howler's master gain (see
 * `stores/sound`).
 */
const SFX_BASE_VOLUME: Partial<Record<string, number>> = {
  "answersMusic.mp3": 0.2,
  "answersSound.mp3": 0.1,
  "boump.mp3": 0.2,
  "show.mp3": 0.5,
  "results.mp3": 0.2,
  "three.mp3": 0.1,
  "second.mp3": 0.1,
  "snearRoll.mp3": 0.1,
  "first.mp3": 0.1,
}

/**
 * Per-pack trims (dB) that land each themed cue on its classic loudness, so
 * switching packs changes the sound but not the mix. Measured with ffmpeg's
 * EBU R128 `ebur128` filter: integrated loudness for the looping bed and the
 * drum roll, maximum momentary loudness for every one-shot. Re-measure when a
 * pack file changes.
 */
export const THEMED_SFX_TRIM_DB: Partial<
  Record<SoundTheme, Partial<Record<string, number>>>
> = {
  techno: {
    "answersMusic.mp3": 8.2,
    "answersSound.mp3": 1.5,
    "boump.mp3": -3.7,
    "show.mp3": -2.3,
    "results.mp3": 11,
    "three.mp3": -4.8,
    "second.mp3": 4.1,
    "snearRoll.mp3": -8.6,
    "first.mp3": 9.9,
  },
}

const THEMED_SFX_PATH = /^\/sounds\/themes\/([^/]+)\/[^/]+$/u

/**
 * Playback volume for a resolved cue path, classic or themed. Reads the theme
 * from the path `sfxForTheme` produced, so call sites stay
 * `useSound(src, { volume: sfxVolume(src) })`.
 */
export const sfxVolume = (src: string): number => {
  const basename = src.slice(src.lastIndexOf("/") + 1)
  const base = SFX_BASE_VOLUME[basename] ?? 1
  const theme = THEMED_SFX_PATH.exec(src)?.[1] as SoundTheme | undefined
  const trim = theme ? (THEMED_SFX_TRIM_DB[theme]?.[basename] ?? 0) : 0

  return Math.min(1, base * 10 ** (trim / 20))
}

/** Seconds left at which the answering countdown starts ticking. */
export const FINAL_COUNTDOWN_SECONDS = 5

export const MANAGER_SKIP_EVENTS = {
  [STATUS.SHOW_ROOM]: EVENTS.MANAGER.START_GAME,
  [STATUS.SHOW_RESPONSES]: EVENTS.MANAGER.SHOW_LEADERBOARD,
  [STATUS.SHOW_LEADERBOARD]: EVENTS.MANAGER.NEXT_QUESTION,
} as const satisfies Partial<
  Record<keyof typeof GAME_STATE_COMPONENTS_MANAGER, string>
>

type ManagerSkipEvent =
  | (typeof EVENTS.MANAGER)["START_GAME"]
  | (typeof EVENTS.MANAGER)["UNLOCK_ANSWERS"]
  | (typeof EVENTS.MANAGER)["ABORT_QUIZ"]
  | (typeof EVENTS.MANAGER)["SHOW_LEADERBOARD"]
  | (typeof EVENTS.MANAGER)["NEXT_QUESTION"]

export const getManagerSkipEvent = (
  status: GameStatus<StatusDataMap>,
): ManagerSkipEvent | null => {
  if (status.name === STATUS.SELECT_ANSWER) {
    return status.data.answeringOpen
      ? EVENTS.MANAGER.ABORT_QUIZ
      : EVENTS.MANAGER.UNLOCK_ANSWERS
  }

  return isKeyOf(MANAGER_SKIP_EVENTS, status.name)
    ? MANAGER_SKIP_EVENTS[status.name]
    : null
}

export function isKeyOf<T extends object>(
  obj: T,
  key: string,
): key is keyof T & string {
  return key in obj
}

export const MANAGER_SKIP_BTN = {
  [STATUS.SHOW_ROOM]: "game:startGame",
  [STATUS.SHOW_START]: null,
  [STATUS.SHOW_PREPARED]: null,
  [STATUS.SHOW_QUESTION]: null,
  [STATUS.SELECT_ANSWER]: "common:skip",
  [STATUS.SHOW_RESULT]: null,
  [STATUS.SHOW_RESPONSES]: "common:next",
  [STATUS.SHOW_LEADERBOARD]: "common:next",
  [STATUS.FINISHED]: "common:exit",
  [STATUS.WAIT]: null,
}
