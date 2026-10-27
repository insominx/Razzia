import type { LectureState, PublicPlayer } from "@razzia/common/types/game"
import { STATUS, type StatusDataMap } from "@razzia/common/types/game/status"
import type { ManagerConfig } from "@razzia/common/types/manager"
import type { ResolvedVisuals } from "@razzia/common/types/visuals"
import { IS_DECK_EMBED } from "@razzia/web/features/deck/embed"
import {
  createStatus,
  type Status,
} from "@razzia/web/features/game/utils/createStatus"
import { create } from "zustand"

type Responses = Record<number, StatusDataMap["SHOW_RESPONSES"]>

// A deck reload also reloads this frame; the results it can show again
// survive in the tab, for the one game it hosts.
const RESPONSES_KEY = "razzia_deck_responses"

const loadResponses = (gameId: string | null): Responses => {
  if (!IS_DECK_EMBED || !gameId) {
    return {}
  }

  try {
    const saved = JSON.parse(
      sessionStorage.getItem(RESPONSES_KEY) ?? "null",
    ) as { gameId?: unknown; responses?: Responses } | null

    return saved?.gameId === gameId && saved.responses ? saved.responses : {}
  } catch {
    return {}
  }
}

const saveResponses = (gameId: string | null, responses: Responses) => {
  if (!IS_DECK_EMBED || !gameId) {
    return
  }

  try {
    sessionStorage.setItem(RESPONSES_KEY, JSON.stringify({ gameId, responses }))
  } catch {
    // Without storage, a reload only loses the reviews.
  }
}

interface ManagerStore<T> {
  config: ManagerConfig | null

  gameId: string | null
  status: Status<T> | null
  players: PublicPlayer[]
  visuals: ResolvedVisuals
  // Set only for a game a lecture deck plays one question at a time.
  lecture: LectureState | null
  // Skip/Next/Exit and the join hint. A deck hides them while it drives the
  // game; a reset leaves the deck's choice alone.
  hostControls: boolean
  // This game's results screens by 0-based question, so a lecture deck can
  // show one again; `review` is the one shown in place of the live screen.
  responses: Responses
  review: number | null
  // Set when the deck drives the game on; the screen that brings ends the
  // review, so another question's screens never interrupt one.
  reviewEndsWithScreen: boolean

  setConfig: (_config: ManagerConfig) => void
  setGameId: (_gameId: string | null) => void
  setVisuals: (_visuals: ResolvedVisuals) => void
  setStatus: <K extends keyof T>(_name: K, _data: T[K]) => void
  resetStatus: () => void
  setPlayers: (_players: PublicPlayer[]) => void
  setLecture: (_lecture: LectureState | null) => void
  setHostControls: (_shown: boolean) => void
  setReview: (_question: number | null) => void
  endReviewWithNextScreen: () => void

  reset: () => void
}

const initialState = {
  config: null,
  gameId: null,
  status: null,
  players: [],
  visuals: {},
  lecture: null,
  responses: {},
  review: null,
  reviewEndsWithScreen: false,
}

export const useManagerStore = create<ManagerStore<StatusDataMap>>((set) => ({
  ...initialState,
  hostControls: !IS_DECK_EMBED,

  setConfig: (config) => set({ config }),

  // Another game's results are not this one's.
  setGameId: (gameId) =>
    set((state) =>
      state.gameId === gameId
        ? { gameId }
        : { gameId, responses: loadResponses(gameId), review: null },
    ),
  setVisuals: (visuals) => set({ visuals }),

  setStatus: (name, data) =>
    set((state) => {
      const status = createStatus(name, data)
      const ended = state.reviewEndsWithScreen
      const review = ended ? null : state.review

      if (status.name !== STATUS.SHOW_RESPONSES) {
        return { status, review, reviewEndsWithScreen: false }
      }

      const responses = {
        ...state.responses,
        [status.data.questionNumber - 1]: status.data,
      }
      saveResponses(state.gameId, responses)

      return { status, review, reviewEndsWithScreen: false, responses }
    }),
  resetStatus: () => set({ status: null }),

  setPlayers: (players) => set({ players }),
  setLecture: (lecture) => set({ lecture }),
  setHostControls: (hostControls) => set({ hostControls }),
  // A review asked for after a command stays up through that command's screen.
  setReview: (review) => set({ review, reviewEndsWithScreen: false }),
  endReviewWithNextScreen: () => set({ reviewEndsWithScreen: true }),

  reset: () => set(initialState),
}))
