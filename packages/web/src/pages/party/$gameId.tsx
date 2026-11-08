import { EVENTS } from "@razzia/common/constants"
import GameScreenBoundary from "@razzia/web/features/game/components/GameScreenBoundary"
import GameWrapper from "@razzia/web/features/game/components/GameWrapper"
import {
  socketClient,
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import {
  GAME_STATE_COMPONENTS,
  isKeyOf,
} from "@razzia/web/features/game/utils/constants"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useEffect } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const PlayerGamePage = () => {
  const navigate = useNavigate()
  const { socket } = useSocket()
  const { gameId: gameIdParam } = useParams({ from: "/party/$gameId" })
  const {
    status,
    visuals,
    setPlayer,
    setGameId,
    setStatus,
    setVisuals,
    reset,
  } = usePlayerStore()
  const { setQuestionStates } = useQuestionStore()
  const { t } = useTranslation()

  useEvent("connect", () => {
    if (gameIdParam) {
      socket.emit(EVENTS.PLAYER.RECONNECT, { gameId: gameIdParam })
    }
  })

  // Leaving this page detaches the socket from the game and clears the
  // status, so arriving without one (e.g. browser Forward) re-attaches.
  useEffect(() => {
    if (socketClient.connected && !usePlayerStore.getState().status) {
      socketClient.emit(EVENTS.PLAYER.RECONNECT, { gameId: gameIdParam })
    }
  }, [gameIdParam])

  // On a reconnect the count follows the screen in one burst.
  useEvent(EVENTS.GAME.TOTAL_PLAYERS, (count) => {
    usePlayerStore.getState().setPlayersHere(count)
  })

  useEvent(
    EVENTS.PLAYER.SUCCESS_RECONNECT,
    ({
      gameId: reconnectGameId,
      status: reconnectStatus,
      player,
      currentQuestion,
      visuals: reconnectVisuals,
    }) => {
      setGameId(reconnectGameId)
      setVisuals(reconnectVisuals)
      setStatus(reconnectStatus.name, reconnectStatus.data)
      setPlayer(player)
      setQuestionStates(currentQuestion)
    },
  )

  useEvent(EVENTS.GAME.STATUS, ({ name, data }) => {
    if (name in GAME_STATE_COMPONENTS) {
      setStatus(name, data)
    }
  })

  // Replace, not push: Back must not return to a game that is gone.
  useEvent(EVENTS.GAME.RESET, (message) => {
    navigate({ to: "/", replace: true })
    reset()
    setQuestionStates(null)
    toast.error(t(message), { id: message })
  })

  if (!gameIdParam) {
    return null
  }

  const CurrentComponent =
    status && isKeyOf(GAME_STATE_COMPONENTS, status.name)
      ? GAME_STATE_COMPONENTS[status.name]
      : null

  return (
    <GameWrapper
      statusName={status?.name}
      backgroundUrl={visuals.backgroundUrl}
    >
      {CurrentComponent && status && (
        <GameScreenBoundary
          resetKey={status}
          onRecover={() =>
            socket.emit(EVENTS.PLAYER.RECONNECT, { gameId: gameIdParam })
          }
        >
          <CurrentComponent data={status.data as never} />
        </GameScreenBoundary>
      )}
    </GameWrapper>
  )
}

export const Route = createFileRoute("/party/$gameId")({
  component: PlayerGamePage,
  onLeave: ({ params: { gameId } }) => {
    socketClient.emit(EVENTS.PLAYER.LEAVE, { gameId })
    // The player is out of the game, so nothing of it may linger: a kept
    // player would send the join page to the name form for a game they left.
    usePlayerStore.getState().reset()
    useQuestionStore.getState().setQuestionStates(null)
  },
})
