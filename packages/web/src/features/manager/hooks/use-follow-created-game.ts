import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { IS_DECK_EMBED } from "@razzia/web/features/deck/embed"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useNavigate } from "@tanstack/react-router"

// Opens the lobby the server created for this host, starting from an empty
// player list so a previous game's players cannot carry over.
export const useFollowCreatedGame = () => {
  const navigate = useNavigate()
  const { setGameId, setVisuals, setStatus, setPlayers, setLecture } =
    useManagerStore()

  useEvent(
    EVENTS.MANAGER.GAME_CREATED,
    ({ gameId, inviteCode, visuals, lecture }) => {
      setGameId(gameId)
      setVisuals(visuals)
      setPlayers([])
      setLecture(lecture ?? null)
      setStatus(STATUS.SHOW_ROOM, {
        text: "game:waitingForPlayers",
        inviteCode,
      })
      // Inside a lecture deck the frame's history is the deck's; keep it flat.
      navigate({
        to: "/party/manager/$gameId",
        params: { gameId },
        ...(IS_DECK_EMBED ? { replace: true } : {}),
      })
    },
  )
}
