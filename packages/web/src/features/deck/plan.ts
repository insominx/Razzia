import type { LectureState } from "@razzia/common/types/game"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import type {
  BridgeState,
  RoundCommand,
} from "@razzia/web/features/deck/protocol"

// While a question runs, the deck's commands wait for its results.
const LIVE_SCREENS = new Set<Status>([
  STATUS.SHOW_START,
  STATUS.SHOW_PREPARED,
  STATUS.SHOW_QUESTION,
  STATUS.SELECT_ANSWER,
])

export type IgnoreReason =
  | "alreadyPlayed"
  | "questionLive"
  | "notInResults"
  | "alreadyShown"
  | "finished"
  | "nothingPlayed"
  | "notAttached"

export type RoundPlan =
  | { kind: "emit" }
  | { kind: "queue" }
  | { kind: "ignore"; reason: IgnoreReason }
  | { kind: "notLectureGame" }

export interface RoundView {
  // This connection is the game's manager and has its current screen.
  attached: boolean
  lecture: LectureState | null
  screen: Status | null
}

const ignore = (reason: IgnoreReason): RoundPlan => ({ kind: "ignore", reason })

// Decides what a deck command does on the game as it stands. Commands that
// arrive before this page is attached wait for it, except the leaderboard,
// which only makes sense on the screen in front of the room.
export const planRoundCommand = (
  command: RoundCommand,
  { attached, lecture, screen }: RoundView,
): RoundPlan => {
  if (!attached || !screen) {
    return command.type === "leaderboard"
      ? ignore("notAttached")
      : { kind: "queue" }
  }

  if (!lecture) {
    return { kind: "notLectureGame" }
  }

  if (lecture.finished || screen === STATUS.FINISHED) {
    return ignore("finished")
  }

  if (LIVE_SCREENS.has(screen)) {
    return ignore("questionLive")
  }

  if (command.type === "play") {
    return lecture.played.includes(command.question)
      ? ignore("alreadyPlayed")
      : { kind: "emit" }
  }

  if (command.type === "leaderboard") {
    if (screen === STATUS.SHOW_LEADERBOARD) {
      return ignore("alreadyShown")
    }

    return screen === STATUS.SHOW_RESPONSES
      ? { kind: "emit" }
      : ignore("notInResults")
  }

  return lecture.played.length === 0
    ? ignore("nothingPlayed")
    : { kind: "emit" }
}

export interface StateInputs {
  connected: boolean
  loggedIn: boolean | null
  pending: BridgeState["pending"]
  reattaching: boolean
  attached: boolean
  gameId: string | null
  lecture: LectureState | null
  status: { name: Status; data: unknown } | null
  players: number
  visible: boolean
  review: number | null
  reviewable: number[]
}

interface ScreenData {
  inviteCode?: string
  questionNumber?: number
  answeringOpen?: boolean
}

// The deck's view of this page: what is on screen and which questions ran.
export const buildBridgeState = ({
  connected,
  loggedIn,
  pending,
  reattaching,
  attached,
  gameId,
  lecture,
  status,
  players,
  visible,
  review,
  reviewable,
}: StateInputs): BridgeState => {
  const screen = attached ? (status?.name ?? null) : null
  const data = (attached ? (status?.data ?? {}) : {}) as ScreenData
  const shownQuestion =
    typeof data.questionNumber === "number" ? data.questionNumber - 1 : null

  return {
    connected,
    loggedIn,
    pending,
    reattaching,
    gameId: attached ? gameId : null,
    inviteCode: lecture?.inviteCode ?? data.inviteCode ?? null,
    lecture: lecture !== null,
    screen,
    answeringOpen:
      screen === STATUS.SELECT_ANSWER && data.answeringOpen === true,
    question: lecture?.current ?? shownQuestion,
    total: lecture?.total ?? null,
    played: lecture?.played ?? [],
    finished: lecture?.finished ?? screen === STATUS.FINISHED,
    players,
    visible,
    reviewing: attached ? review : null,
    reviewable: attached ? reviewable : [],
  }
}
