import type { LectureState } from "@razzia/common/types/game"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import type { PollSnapshot } from "@razzia/common/types/poll"
import {
  type BridgePoll,
  type BridgeState,
  FEATURES,
  type RoundCommand,
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
  | "busy"

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
  // A poll is open or showing its result.
  pollShowing?: boolean
}

const ignore = (reason: IgnoreReason): RoundPlan => ({ kind: "ignore", reason })

// Decides what a deck command does on the game as it stands. Commands that
// arrive before this page is attached wait for it, except the leaderboard,
// which only makes sense on the screen in front of the room.
export const planRoundCommand = (
  command: RoundCommand,
  { attached, lecture, screen, pollShowing = false }: RoundView,
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

  // A poll owns the room until it is dismissed, and the server ignores every
  // quiz step meanwhile (`play` and `finish` answer `busy`, the leaderboard
  // does nothing). Say so, rather than report a step done that did not happen.
  if (pollShowing) {
    return ignore("busy")
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
  // The poll on the stage, as the poll store holds it.
  poll?: PollSnapshot | null
}

// What a deck may be told of the poll on the stage: never a name, and counts
// only when the host's own screen has them (after the close, or live).
const bridgePollOf = (snapshot: PollSnapshot): BridgePoll => {
  const live = snapshot.live === true

  return {
    id: snapshot.pollId,
    phase: snapshot.phase,
    anonymous: snapshot.anonymous,
    live,
    voted: snapshot.total ?? 0,
    ...(snapshot.counts && (snapshot.phase === "closed" || live)
      ? { counts: [...snapshot.counts] }
      : {}),
  }
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
  poll = null,
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
    // Gated like gameId: after Restart quiz the old game's PIN and progress
    // must not show until the new lobby is attached.
    inviteCode: attached
      ? (lecture?.inviteCode ?? data.inviteCode ?? null)
      : null,
    lecture: lecture !== null,
    screen,
    answeringOpen:
      screen === STATUS.SELECT_ANSWER && data.answeringOpen === true,
    question: attached ? (lecture?.current ?? shownQuestion) : null,
    total: lecture?.total ?? null,
    played: attached ? (lecture?.played ?? []) : [],
    finished: attached && (lecture?.finished ?? screen === STATUS.FINISHED),
    players,
    visible,
    reviewing: attached ? review : null,
    reviewable: attached ? reviewable : [],
    features: [...FEATURES],
    // Like the game, the poll and what already ran belong to the game this
    // page is attached to.
    poll: attached && poll ? bridgePollOf(poll) : null,
    pollsDone: attached
      ? (lecture?.pollsDone ?? []).map(({ id, counts, total, partial }) => ({
          id,
          counts: [...counts],
          total,
          ...(partial ? { partial: true } : {}),
        }))
      : [],
  }
}
