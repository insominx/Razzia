import type { PollSnapshot, PollTally } from "@razzia/common/types/poll"
import { create } from "zustand"

interface PollStore {
  // What this screen is told about the poll, in the shape the server made for
  // it. `null` while none is showing. It replaces, never merges: the server's
  // word is the whole picture.
  snapshot: PollSnapshot | null

  apply: (_snapshot: PollSnapshot | null) => void
  // The host's running count between two snapshots.
  applyTally: (_tally: PollTally) => void
  // A player's own pick, set on the tap itself before the server answers.
  setMine: (_option: number | null) => void
  reset: () => void
}

export const usePollStore = create<PollStore>((set) => ({
  snapshot: null,

  apply: (snapshot) => set({ snapshot }),

  applyTally: (tally) =>
    set((state) => {
      const { snapshot } = state

      // A count for another poll, or for one that has closed, is late news.
      if (
        !snapshot ||
        snapshot.pollId !== tally.pollId ||
        snapshot.phase !== "open"
      ) {
        return state
      }

      const { voters: _before, ...rest } = snapshot

      return {
        snapshot: {
          ...rest,
          counts: tally.counts,
          total: tally.total,
          ...(tally.voters ? { voters: tally.voters } : {}),
        },
      }
    }),

  setMine: (mine) =>
    set((state) =>
      state.snapshot ? { snapshot: { ...state.snapshot, mine } } : state,
    ),

  reset: () => set({ snapshot: null }),
}))
