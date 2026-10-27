import type { LectureState, PublicPlayer } from "@razzia/common/types/game"
import type { StatusDataMap } from "@razzia/common/types/game/status"
import type { ManagerConfig } from "@razzia/common/types/manager"
import type { ResolvedVisuals } from "@razzia/common/types/visuals"
import { IS_DECK_EMBED } from "@razzia/web/features/deck/embed"
import {
  createStatus,
  type Status,
} from "@razzia/web/features/game/utils/createStatus"
import { create } from "zustand"

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

  setConfig: (_config: ManagerConfig) => void
  setGameId: (_gameId: string | null) => void
  setVisuals: (_visuals: ResolvedVisuals) => void
  setStatus: <K extends keyof T>(_name: K, _data: T[K]) => void
  resetStatus: () => void
  setPlayers: (_players: PublicPlayer[]) => void
  setLecture: (_lecture: LectureState | null) => void
  setHostControls: (_shown: boolean) => void

  reset: () => void
}

const initialState = {
  config: null,
  gameId: null,
  status: null,
  players: [],
  visuals: {},
  lecture: null,
}

export const useManagerStore = create<ManagerStore<StatusDataMap>>((set) => ({
  ...initialState,
  hostControls: !IS_DECK_EMBED,

  setConfig: (config) => set({ config }),

  setGameId: (gameId) => set({ gameId }),
  setVisuals: (visuals) => set({ visuals }),

  setStatus: (name, data) => set({ status: createStatus(name, data) }),
  resetStatus: () => set({ status: null }),

  setPlayers: (players) => set({ players }),
  setLecture: (lecture) => set({ lecture }),
  setHostControls: (hostControls) => set({ hostControls }),

  reset: () => set(initialState),
}))
