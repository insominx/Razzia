import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useNavigate } from "@tanstack/react-router"

// The server answers every game:create with the game it made; follow it from
// any manager page, so a create that lands late cannot leave the host behind.
export const useFollowCreatedGame = () => {
  const navigate = useNavigate()
  const { setGameId, setVisuals, setStatus, setPlayers } = useManagerStore()

  useEvent(EVENTS.MANAGER.GAME_CREATED, ({ gameId, inviteCode, visuals }) => {
    setGameId(gameId)
    setVisuals(visuals)
    setPlayers([])
    setStatus(STATUS.SHOW_ROOM, {
      text: "game:waitingForPlayers",
      inviteCode,
    })
    navigate({ to: "/party/manager/$gameId", params: { gameId } })
  })
}
