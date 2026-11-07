import type { PublicPlayer } from "@razzia/common/types/game"
import {
  BOARD_REORDER_S,
  PODIUM_GAP_S,
  PODIUM_T,
} from "@razzia/web/features/game/audio/scenes"

/**
 * The bar race. The board holds the old standing, then the bars grow to the new
 * scores, and at `BOARD_REORDER_MS` the rows swap into their new order. The
 * score's groove and first overtake land on the same beat (`BOARD_REORDER_S`).
 */
export const BOARD_REORDER_MS = BOARD_REORDER_S * 1_000

/** How long the old standing is held before the bars start to move. */
export const BOARD_HOLD_MS = 1_500

/** The bars' growth and the odometers' roll, ending as the rows swap. */
export const BOARD_RACE_MS = BOARD_REORDER_MS - BOARD_HOLD_MS

/** The commentary line lands this long after the rows have swapped. */
export const BOARD_COMMENT_DELAY_MS = 350

/** Rows slide to their new places over this long. */
export const BOARD_SWAP_MS = 700

/** A bar's length as a share of the board's longest, never negative. */
export const barShare = (points: number, longest: number): number =>
  longest <= 0 ? 0 : Math.min(1, Math.max(0, points / longest))

/** Places gained (positive) or lost since the last board; 0 when unknown. */
export const placeChange = (
  old: PublicPlayer[],
  current: PublicPlayer[],
  id: string,
): number => {
  const before = old.findIndex((player) => player.id === id)
  const now = current.findIndex((player) => player.id === id)

  if (before === -1 || now === -1) {
    return 0
  }

  return before - now
}

export interface Commentary {
  /** An `game:board.*` key. */
  key: string
  values: Record<string, string | number>
}

const format = (points: number) => points.toLocaleString("en-US")

/**
 * One line for the room to read, the most interesting true thing about this
 * board. Written for any number of players, down to one.
 *
 * The first board's "before" is only the join order, no place anyone held, so
 * it never counts as an overtake.
 */
export const boardCommentary = (
  old: PublicPlayer[],
  current: PublicPlayer[],
): Commentary | null => {
  const leader = current.at(0)
  const second = current.at(1)

  if (!leader) {
    return null
  }

  const scoredBefore = old.some((player) => player.points > 0)
  const gains = current.map((player) => ({
    player,
    gained: player.points - (old.find((p) => p.id === player.id)?.points ?? 0),
  }))

  if (scoredBefore) {
    const oldLeader = old.at(0)

    if (oldLeader && oldLeader.id !== leader.id) {
      return {
        key: "game:board.newLeader",
        values: { name: leader.username, other: oldLeader.username },
      }
    }

    const climbs = current
      .map((player) => ({ player, up: placeChange(old, current, player.id) }))
      .filter((entry) => entry.up > 0)
      .sort((a, b) => b.up - a.up)
    const climber = climbs.at(0)

    if (climber) {
      const now = current.findIndex((p) => p.id === climber.player.id)
      const beaten = current
        .slice(now + 1)
        .find(
          (player) =>
            old.findIndex((p) => p.id === player.id) <
            old.findIndex((p) => p.id === climber.player.id),
        )

      if (beaten) {
        return {
          key: "game:board.overtook",
          values: { name: climber.player.username, other: beaten.username },
        }
      }
    }

    const newcomer = current.find(
      (player) =>
        old.length >= current.length && !old.some((p) => p.id === player.id),
    )

    if (newcomer) {
      return {
        key: "game:board.enters",
        values: { name: newcomer.username },
      }
    }
  }

  const biggest = [...gains].sort((a, b) => b.gained - a.gained).at(0)

  if (biggest && biggest.gained > 0 && current.length > 1) {
    return {
      key: "game:board.biggestGain",
      values: {
        name: biggest.player.username,
        points: format(biggest.gained),
      },
    }
  }

  if (second && leader.points > 0 && leader.points - second.points <= 100) {
    return {
      key: "game:board.tight",
      values: {
        name: leader.username,
        other: second.username,
        points: format(leader.points - second.points),
      },
    }
  }

  return {
    key: "game:board.leads",
    values: { name: leader.username, points: format(leader.points) },
  }
}

/**
 * Seconds after the podium scene starts for each beat, for however many places
 * there are: each missing place pulls the rest earlier so one or two players do
 * not wait through silence. Mirrors the score's own timing so the picture and
 * the music land together.
 */
export interface PodiumTimes {
  third: number | null
  second: number | null
  roll: number
  first: number
}

export const podiumTimes = (players: number): PodiumTimes => {
  const places = Math.min(3, Math.max(1, Math.floor(players)))
  const shift = (3 - places) * PODIUM_GAP_S

  return {
    third: places >= 3 ? PODIUM_T.third : null,
    second:
      places >= 2 ? PODIUM_T.second - (places === 2 ? PODIUM_GAP_S : 0) : null,
    roll: PODIUM_T.roll - shift,
    first: PODIUM_T.first - shift,
  }
}

/** The winner's name holds the whole frame this long, then clears to the podium. */
export const WINNER_FLOOD_MS = 2_600

/** Confetti bursts when first place lands and stops after this long. */
export const CONFETTI_MS = 8_000
