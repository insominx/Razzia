import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import ConfirmDialog from "@razzia/web/components/AlertDialog"
import { IS_DECK_EMBED } from "@razzia/web/features/deck/embed"
import GameScreenBoundary from "@razzia/web/features/game/components/GameScreenBoundary"
import GameWrapper from "@razzia/web/features/game/components/GameWrapper"
import Responses from "@razzia/web/features/game/components/states/Responses"
import {
  socketClient,
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useHostPresence } from "@razzia/web/features/game/hooks/use-host-presence"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import {
  GAME_STATE_COMPONENTS_MANAGER,
  getManagerSkipEvent,
  isKeyOf,
} from "@razzia/web/features/game/utils/constants"
import PollShell from "@razzia/web/features/poll/components/PollShell"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import {
  createFileRoute,
  useBlocker,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Leaving closes the room for everyone, so it is confirmed once players are in
// or a question has started. An empty lobby, a finished game and a lecture deck
// (which drives the game itself) leave without asking.
const hostShouldConfirmLeave = () => {
  if (IS_DECK_EMBED) {
    return false
  }

  const { gameId, status, players, lecture } = useManagerStore.getState()

  if (!gameId || !status) {
    return false
  }

  if (status.name === STATUS.FINISHED || lecture?.finished) {
    return false
  }

  return players.length > 0 || status.name !== STATUS.SHOW_ROOM
}

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
    setLecture,
    reset,
    responses,
    review,
  } = useManagerStore()
  useHostPresence(gameIdParam)
  const { setQuestionStates } = useQuestionStore()
  const { t } = useTranslation()
  // The lobby Exit button asks through the same dialog as a router leave.
  const [exitAsked, setExitAsked] = useState(false)
  const blocker = useBlocker({
    shouldBlockFn: hostShouldConfirmLeave,
    withResolver: true,
    disabled: IS_DECK_EMBED,
    // Closing the tab is left alone.
    enableBeforeUnload: false,
  })
  // A lecture deck showing a played question's results again, over the live
  // screen; the game's own controls wait until the review ends.
  const reviewed = review === null ? undefined : responses[review]
  const nextAction = status && !reviewed ? getManagerSkipEvent(status) : null

  // The live screen is only hidden under a review, and hiding does not stop
  // a question's audio or video: it would play on under the review slide.
  useEffect(() => {
    if (reviewed) {
      for (const media of document.querySelectorAll<HTMLMediaElement>(
        "[data-live-screen] audio, [data-live-screen] video",
      )) {
        media.pause()
      }
    }
  }, [reviewed])

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

  useEvent(
    EVENTS.MANAGER.SUCCESS_RECONNECT,
    ({
      gameId: reconnectGameId,
      status: reconnectStatus,
      players,
      currentQuestion,
      visuals: reconnectVisuals,
      lecture,
      poll,
    }) => {
      if (reconnectGameId !== gameIdParam) {
        return
      }

      setGameId(reconnectGameId)
      useManagerStore
        .getState()
        .applyPresence({ gameId: reconnectGameId, players })
      setVisuals(reconnectVisuals)
      setStatus(reconnectStatus.name, reconnectStatus.data)
      setQuestionStates(currentQuestion)
      setLecture(lecture ?? null)
      // A poll showing when the host came back, or none.
      usePollStore.getState().apply(poll ?? null)
    },
  )

  useEvent(EVENTS.MANAGER.LECTURE_STATE, setLecture)

  // Subscribe before requesting the initial roster. Creation can precede this
  // route mounting, so even a new lobby needs an authoritative resync.
  useEffect(() => {
    if (socketClient.connected) {
      socketClient.emit(EVENTS.MANAGER.RECONNECT, { gameId: gameIdParam })
    }
  }, [gameIdParam])

  // Replace, not push: Back must not return to a game that is gone.
  useEvent(EVENTS.GAME.RESET, (message) => {
    // In a lecture deck the game is still there: the deck bridge keeps asking
    // until the server lets this connection back in.
    if (IS_DECK_EMBED && message === "errors:game.managerAlreadyConnected") {
      return
    }

    navigate({ to: "/manager/config", replace: true, ignoreBlocker: true })
    reset()
    usePollStore.getState().reset()
    setQuestionStates(null)
    toast.error(t(message), { id: message })
  })

  // The page's own exits: the game is already closed or about to be, and the
  // blocker must not ask again. Replace: Back must not reopen it.
  const leave = () => {
    navigate({ to: "/manager/config", replace: true, ignoreBlocker: true })
    reset()
    usePollStore.getState().reset()
    setQuestionStates(null)
  }

  const handleSkip = () => {
    if (!status) {
      return
    }

    if (status.name === STATUS.FINISHED) {
      leave()

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
    if (hostShouldConfirmLeave()) {
      setExitAsked(true)

      return
    }

    leave()
  }

  const handleConfirmLeave = () => {
    if (blocker.status === "blocked") {
      blocker.proceed()
    } else {
      leave()
    }
  }

  const handleLeaveDialogChange = (open: boolean) => {
    if (open) {
      return
    }

    // Settling an already settled blocker is a no-op, so this is safe after a
    // confirm too.
    if (blocker.status === "blocked") {
      blocker.reset()
    }

    setExitAsked(false)
  }

  const CurrentComponent =
    status && isKeyOf(GAME_STATE_COMPONENTS_MANAGER, status.name)
      ? GAME_STATE_COMPONENTS_MANAGER[status.name]
      : null

  return (
    <>
      <PollShell role="host">
        <GameWrapper
          statusName={reviewed ? STATUS.SHOW_RESPONSES : status?.name}
          backgroundUrl={visuals.backgroundUrl}
          onNext={status && !reviewed ? handleSkip : undefined}
          nextActionKey={nextAction}
          onBack={
            status?.name === STATUS.SHOW_ROOM && !reviewed
              ? handleBack
              : undefined
          }
          manager
        >
          {CurrentComponent && status && (
            // Hidden, not unmounted, under a review: its timer and answer count
            // keep running, and nothing replays when the review ends.
            <div data-live-screen className={reviewed ? "hidden" : "contents"}>
              <GameScreenBoundary
                resetKey={status}
                onRecover={() =>
                  socket.emit(EVENTS.MANAGER.RECONNECT, { gameId: gameIdParam })
                }
              >
                <CurrentComponent data={status.data as never} />
              </GameScreenBoundary>
            </div>
          )}
          {reviewed && <Responses key={`review-${review}`} data={reviewed} />}
        </GameWrapper>
      </PollShell>
      <ConfirmDialog
        open={exitAsked || blocker.status === "blocked"}
        onOpenChange={handleLeaveDialogChange}
        title={t("game:leave.title")}
        description={t("game:leave.description")}
        confirmLabel={t("game:leave.confirm")}
        onConfirm={handleConfirmLeave}
      />
    </>
  )
}

export const Route = createFileRoute("/party/manager/$gameId")({
  component: ManagerGamePage,
  onLeave: ({ params: { gameId } }) => {
    socketClient.emit(EVENTS.MANAGER.LEAVE, { gameId })
    useManagerStore.getState().resetStatus()
    useManagerStore.getState().setGameId(null)
    useManagerStore.getState().clearPresence()
    usePollStore.getState().reset()
  },
})
