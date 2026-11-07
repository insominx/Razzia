import { create } from "zustand"

interface LaunchStore {
  /** Set by the start countdown; the first question's card takes it. */
  armed: boolean
  arm: () => void
  /** True once, if the countdown just ran: GO belongs to it, and no one else. */
  consume: () => boolean
}

/**
 * Hands "GO" from the countdown to the first round card. The lamps end exactly
 * as the first question is prepared, and a screen cannot flash for a screen
 * that is already gone, so the card that replaces the countdown does it. A
 * reconnect straight into a card never saw the lamps and gets no GO.
 */
export const useLaunchStore = create<LaunchStore>((set, get) => ({
  armed: false,
  arm: () => set({ armed: true }),
  consume: () => {
    const { armed } = get()

    if (armed) {
      set({ armed: false })
    }

    return armed
  },
}))
