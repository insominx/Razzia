import { EVENTS } from "@razzia/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { useEffect } from "react"

/**
 * Keeps this screen's poll in step with the room. The server tells each screen
 * its own view as the poll starts, takes votes, closes and clears; this only
 * records it.
 *
 * A screen that has just opened has missed whatever began before it was
 * listening (a student's page opens right after they join, and nothing asks
 * the server to replay the room), so it asks once, and again whenever the game
 * it is in changes. The answer is the poll as it stands, or `null`.
 */
export const usePollLane = (gameId: string | null) => {
  const { socket } = useSocket()

  useEvent(EVENTS.POLL.STATE, (snapshot) => {
    usePollStore.getState().apply(snapshot)
  })

  useEvent(EVENTS.POLL.TALLY, (tally) => {
    usePollStore.getState().applyTally(tally)
  })

  // The host's "n of m voted" needs m, and the room announces it on every
  // join and leave and to a host who comes back.
  useEvent(EVENTS.GAME.TOTAL_PLAYERS, (count) => {
    usePollStore.getState().setPlayerTotal(count)
  })

  useEffect(() => {
    if (gameId) {
      socket.emit(EVENTS.POLL.SYNC, { gameId })
    }
  }, [socket, gameId])
}
