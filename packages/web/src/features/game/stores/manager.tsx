import type { Player } from "@razzia/common/types/game"
import type { StatusDataMap } from "@razzia/common/types/game/status"
import type { ManagerConfig } from "@razzia/common/types/manager"
import type { ResolvedVisuals } from "@razzia/common/types/visuals"
import {
  createStatus,
  type Status,
} from "@razzia/web/features/game/utils/createStatus"
import { create } from "zustand"

interface ManagerStore<T> {
  config: ManagerConfig | null

  gameId: string | null
  status: Status<T> | null
  players: Player[]
  visuals: ResolvedVisuals

  setConfig: (_config: ManagerConfig) => void
  setGameId: (_gameId: string | null) => void
  setVisuals: (_visuals: ResolvedVisuals) => void
  setStatus: <K extends keyof T>(_name: K, _data: T[K]) => void
  resetStatus: () => void
  setPlayers: (_players: Player[]) => void

  reset: () => void
}

const initialState = {
  config: null,
  gameId: null,
  status: null,
  players: [],
  visuals: {},
}

export const useManagerStore = create<ManagerStore<StatusDataMap>>((set) => ({
  ...initialState,

  setConfig: (config) => set({ config }),

  setGameId: (gameId) => set({ gameId }),
  setVisuals: (visuals) => set({ visuals }),

  setStatus: (name, data) => set({ status: createStatus(name, data) }),
  resetStatus: () => set({ status: null }),

  setPlayers: (players) => set({ players }),

  reset: () => set(initialState),
}))
