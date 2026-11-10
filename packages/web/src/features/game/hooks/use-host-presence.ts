import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { score } from "@razzia/web/features/game/audio"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useEffect } from "react"

// The route owns the roster through polls and quiz screens. Legacy player
// events still serve older clients; only snapshots write this client's roster.
export const useHostPresence = (gameId: string) => {
  useEvent(EVENTS.MANAGER.PLAYER_PRESENCE, (snapshot) => {
    const store = useManagerStore.getState()

    if (snapshot.gameId !== gameId || store.gameId !== gameId) {
      return
    }

    if (store.presenceKnown && store.status?.name === STATUS.SHOW_ROOM) {
      const names = new Set(store.players.map((player) => player.username))
      snapshot.players.forEach((player, index) => {
        if (!names.has(player.username)) {
          score.cue({ cue: "join", index })
        }
      })
    }

    store.applyPresence(snapshot)
  })

  useEvent("disconnect", () => {
    useManagerStore.getState().invalidatePresence()
  })
  useEffect(
    () => () => {
      const store = useManagerStore.getState()

      if (store.gameId === gameId) {
        store.clearPresence()
      }
    },
    [gameId],
  )
}
