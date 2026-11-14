import type {
  PollDone,
  PollSnapshot,
  PollTally,
} from "@razzia/common/types/poll"
import { create } from "zustand"

// One vote that raised the total: who it was (a sealed poll names them; a live
// poll, whose counts move with it, does not) and the total it made. `seq`
// only grows, so a screen can tell which arrivals it has already shown.
export interface PollArrival {
  seq: number
  name: string | null
  total: number
}

// The host's screen shows arrivals as they come; it never needs a long past.
export const ARRIVALS_KEPT = 60

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
  // A closed poll's result shown again on the host's screen in a deck's frame
  // (the deck has gone back to its face). Local to this page: the room, its
  // stage and the phones know nothing of it. `null` when none is shown.
  review: PollDone | null
  // The open poll's arrivals, oldest first, from the host's tallies only: a
  // snapshot (a reload, a sync) replays none. Cleared for a new poll.
  arrivals: PollArrival[]

  apply: (_snapshot: PollSnapshot | null) => void
  // The host's running count between two snapshots.
  applyTally: (_tally: PollTally) => void
  // A player's own pick, set on the tap itself before the server answers.
  setMine: (_option: number | null) => void
  setPlayerTotal: (_count: number) => void
  setReview: (_review: PollDone | null) => void
  reset: () => void
}

export const usePollStore = create<PollStore>((set) => ({
  snapshot: null,
  playerTotal: null,
  review: null,
  arrivals: [],

  apply: (snapshot) =>
    set((state) =>
      snapshot?.pollId === state.snapshot?.pollId && snapshot
        ? { snapshot }
        : { snapshot, arrivals: [] },
    ),

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
      const before = snapshot.total ?? 0
      let { arrivals } = state

      // Each vote that raised the total is an arrival; a changed vote and a
      // leaver are not. Only the last of a jump carries the tally's name.
      if (tally.total > before) {
        const last = arrivals.at(-1)?.seq ?? 0
        const added = Array.from(
          { length: tally.total - before },
          (_, index): PollArrival => ({
            seq: last + index + 1,
            name:
              index === tally.total - before - 1
                ? (tally.arrived ?? null)
                : null,
            total: before + index + 1,
          }),
        )

        arrivals = [...arrivals, ...added].slice(-ARRIVALS_KEPT)
      }

      // A sealed poll's tally carries the total alone, and the snapshot stays
      // without counts.
      return {
        snapshot: {
          ...rest,
          total: tally.total,
          ...(tally.counts ? { counts: tally.counts } : {}),
          ...(tally.voters ? { voters: tally.voters } : {}),
        },
        arrivals,
      }
    }),

  setMine: (mine) =>
    set((state) =>
      state.snapshot ? { snapshot: { ...state.snapshot, mine } } : state,
    ),

  setPlayerTotal: (playerTotal) => set({ playerTotal }),

  setReview: (review) => set({ review }),

  reset: () =>
    set({ snapshot: null, playerTotal: null, review: null, arrivals: [] }),
}))
