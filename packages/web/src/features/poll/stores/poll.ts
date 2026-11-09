import type { PollSnapshot, PollTally } from "@razzia/common/types/poll"
import { create } from "zustand"

interface PollStore {
  // What this screen is told about the poll, in the shape the server made for
  // it. `null` while none is showing. It replaces, never merges: the server's
  // word is the whole picture.
  snapshot: PollSnapshot | null
  // How many are in the room, from the same `game:totalPlayers` count the
  // lobby and the deck bridge read. The manager store's player list is filled
  // by the lobby and by a reconnect only, so between questions it misses a
  // late joiner; this does not. `null` until the first count arrives.
  playerTotal: number | null

  apply: (_snapshot: PollSnapshot | null) => void
  // The host's running count between two snapshots.
  applyTally: (_tally: PollTally) => void
  // A player's own pick, set on the tap itself before the server answers.
  setMine: (_option: number | null) => void
  setPlayerTotal: (_count: number) => void
  reset: () => void
}

export const usePollStore = create<PollStore>((set) => ({
  snapshot: null,
  playerTotal: null,

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

      const { voters: _voters, counts: _counts, ...rest } = snapshot

      // A sealed poll's tally carries the total alone, and the snapshot stays
      // without counts.
      return {
        snapshot: {
          ...rest,
          total: tally.total,
          ...(tally.counts ? { counts: tally.counts } : {}),
          ...(tally.voters ? { voters: tally.voters } : {}),
        },
      }
    }),

  setMine: (mine) =>
    set((state) =>
      state.snapshot ? { snapshot: { ...state.snapshot, mine } } : state,
    ),

  setPlayerTotal: (playerTotal) => set({ playerTotal }),

  reset: () => set({ snapshot: null, playerTotal: null }),
}))
