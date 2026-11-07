import type { PublicPlayer } from "@razzia/common/types/game"

/** The lobby draws this many seats; the rest are counted, not drawn. */
export const MAX_SEATS = 60

/** Seats are always drawn in rows of at least this many, empty ones included. */
const MIN_SEATS = 12

export interface SeatTier {
  /** Tailwind classes for the seat's name. */
  text: string
  /** The narrowest a seat may get, in rem, so the grid sets its own columns. */
  minRem: number
}

/**
 * How big a seat is for this many players. A small room gets large names that
 * read from the back; a full one shrinks so sixty still fit, and never below a
 * size a front row can read.
 */
export const seatTier = (players: number): SeatTier => {
  if (players <= 12) {
    return { text: "text-4xl stage:text-[2.75rem]", minRem: 17 }
  }

  if (players <= 30) {
    return { text: "text-3xl stage:text-4xl", minRem: 14 }
  }

  return { text: "text-2xl stage:text-[1.75rem]", minRem: 12 }
}

export interface Seats {
  shown: PublicPlayer[]
  /** Players past the drawn seats: "+N more". */
  more: number
  /** Empty seats drawn after the players, so the room looks like a room. */
  empty: number
}

/**
 * Who is drawn, how many are left over, and how many empty seats fill out the
 * last row. The grid never draws more than `MAX_SEATS` in total.
 */
export const seatsFor = (players: PublicPlayer[]): Seats => {
  const shown = players.slice(0, MAX_SEATS)
  const more = players.length - shown.length
  const target = Math.min(
    MAX_SEATS,
    Math.max(MIN_SEATS, Math.ceil((shown.length + 1) / 4) * 4),
  )

  return { shown, more, empty: Math.max(0, target - shown.length) }
}

/** The join address as read aloud: no scheme, no trailing slash. */
export const shortUrl = (origin: string): string =>
  origin.replace(/^[a-z][a-z0-9+.-]*:\/\//iu, "").replace(/\/+$/u, "")

/** A PIN split into its characters, spaces kept as gaps. */
export const pinCells = (code: string): string[] => code.split("")
