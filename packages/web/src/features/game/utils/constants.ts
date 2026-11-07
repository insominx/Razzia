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
import Standing from "@razzia/web/features/game/components/states/Standing"
import Start from "@razzia/web/features/game/components/states/Start"
import Wait from "@razzia/web/features/game/components/states/Wait"

import { STATUS, type StatusDataMap } from "@razzia/common/types/game/status"
import type { Status as GameStatus } from "@razzia/web/features/game/utils/createStatus"

// Everything that is plain data lives in `game-constants.ts` and is re-exported
// here, so existing imports keep working. Anything a screen needs should come from
// that file directly: this one imports the screens.
export * from "@razzia/web/features/game/utils/game-constants"

export const GAME_STATE_COMPONENTS = {
  [STATUS.SELECT_ANSWER]: Answers,
  [STATUS.SHOW_QUESTION]: Question,
  [STATUS.WAIT]: Wait,
  [STATUS.SHOW_START]: Start,
  [STATUS.SHOW_RESULT]: Result,
  [STATUS.SHOW_STANDING]: Standing,
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
  [STATUS.SHOW_STANDING]: null,
  [STATUS.SHOW_RESPONSES]: "common:next",
  [STATUS.SHOW_LEADERBOARD]: "common:next",
  [STATUS.FINISHED]: "common:exit",
  [STATUS.WAIT]: null,
}
