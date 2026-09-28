import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import GameWrapper from "@razzia/web/features/game/components/GameWrapper"
import {
  socketClient,
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import {
  GAME_STATE_COMPONENTS_MANAGER,
  getManagerSkipEvent,
  isKeyOf,
} from "@razzia/web/features/game/utils/constants"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useEffect } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ManagerGamePage = () => {
  const navigate = useNavigate()
  const { gameId: gameIdParam } = useParams({ from: "/party/manager/$gameId" })
  const { socket } = useSocket()
  const {
    gameId,
    status,
    visuals,
    setGameId,
    setStatus,
    setVisuals,
    setPlayers,
    reset,
  } = useManagerStore()
  const { setQuestionStates } = useQuestionStore()
  const { t } = useTranslation()
  const nextAction = status ? getManagerSkipEvent(status) : null

  useEvent(EVENTS.GAME.STATUS, ({ name, data }) => {
    if (name in GAME_STATE_COMPONENTS_MANAGER) {
      setStatus(name, data)
    }
  })

  useEvent("connect", () => {
    if (gameIdParam) {
      socket.emit(EVENTS.MANAGER.RECONNECT, { gameId: gameIdParam })
    }
  })

  // Leaving this page detaches the socket from the game and clears the
  // status, so arriving without one (e.g. browser Forward) re-attaches.
  useEffect(() => {
    if (socketClient.connected && !useManagerStore.getState().status) {
      socketClient.emit(EVENTS.MANAGER.RECONNECT, { gameId: gameIdParam })
    }
  }, [gameIdParam])

  useEvent(
    EVENTS.MANAGER.SUCCESS_RECONNECT,
    ({
      gameId: reconnectGameId,
      status: reconnectStatus,
      players,
      currentQuestion,
      visuals: reconnectVisuals,
    }) => {
      setGameId(reconnectGameId)
      setVisuals(reconnectVisuals)
      setStatus(reconnectStatus.name, reconnectStatus.data)
      setPlayers(players)
      setQuestionStates(currentQuestion)
    },
  )

  // Replace, not push: Back must not return to a game that is gone.
  useEvent(EVENTS.GAME.RESET, (message) => {
    navigate({ to: "/manager/config", replace: true })
    reset()
    setQuestionStates(null)
    toast.error(t(message))
  })

  const handleSkip = () => {
    if (!status) {
      return
    }

    // Leaving closes the game, so replace: Back must not reopen it.
    if (status.name === STATUS.FINISHED) {
      navigate({ to: "/manager/config", replace: true })
      reset()
      setQuestionStates(null)

      return
    }

    if (!gameId) {
      return
    }

    if (nextAction) {
      socket.emit(nextAction, { gameId })
    }
  }

  const handleBack = () => {
    navigate({ to: "/manager/config", replace: true })
    reset()
    setQuestionStates(null)
  }

  const CurrentComponent =
    status && isKeyOf(GAME_STATE_COMPONENTS_MANAGER, status.name)
      ? GAME_STATE_COMPONENTS_MANAGER[status.name]
      : null

  return (
    <GameWrapper
      statusName={status?.name}
      backgroundUrl={visuals.backgroundUrl}
      onNext={status ? handleSkip : undefined}
      nextActionKey={nextAction}
      onBack={status?.name === STATUS.SHOW_ROOM ? handleBack : undefined}
      manager
    >
      {CurrentComponent && status && (
        <CurrentComponent data={status.data as never} />
      )}
    </GameWrapper>
  )
}

export const Route = createFileRoute("/party/manager/$gameId")({
  component: ManagerGamePage,
  onLeave: ({ params: { gameId } }) => {
    socketClient.emit(EVENTS.MANAGER.LEAVE, { gameId })
    useManagerStore.getState().resetStatus()
  },
})
