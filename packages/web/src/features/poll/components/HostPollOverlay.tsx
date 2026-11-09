import { EVENTS } from "@razzia/common/constants"
import type { PollOutcome } from "@razzia/common/types/poll"
import Button from "@razzia/web/components/Button"
import { IS_DECK_EMBED } from "@razzia/web/features/deck/embed"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import PollBars from "@razzia/web/features/poll/components/PollBars"
import PollFrame from "@razzia/web/features/poll/components/PollFrame"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { emitWithAck } from "@razzia/web/features/poll/utils/emit-with-ack"
import {
  QUESTION_CLASSES,
  questionTier,
} from "@razzia/web/features/poll/utils/type-tier"
import clsx from "clsx"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const QUESTION_ID = "poll-question"

/**
 * The room's poll, on the host's screen: the question and how many have voted
 * while it is open (and, when the poll is live, the votes as they come in),
 * then, when the host closes it, the result, until the host says Done. The quiz
 * screen under it is untouched.
 *
 * It draws what the server sent. A sealed poll is sent without counts until
 * the close, so an open poll with none is shown as the options alone.
 *
 * In a deck's frame this screen is the projector. Names are never drawn there,
 * even for a named poll (they are saved in the result and shown on the manager
 * page afterwards), and Close and Done show only while the presenter has
 * Razzia's own controls up (the deck's Q key): the deck closes and dismisses
 * the poll from the clicker.
 */
const HostPollOverlay = () => {
  const snapshot = usePollStore((state) => state.snapshot)
  const gameId = useManagerStore((state) => state.gameId)
  const backgroundUrl = useManagerStore((state) => state.visuals.backgroundUrl)
  const hostControls = useManagerStore((state) => state.hostControls)
  const lobbyPlayers = useManagerStore((state) => state.players.length)
  const playerTotal = usePollStore((state) => state.playerTotal)
  const { socket } = useSocket()
  const { t } = useTranslation()
  // A click is answered once; a second one while it waits would only repeat it.
  const [pending, setPending] = useState(false)

  if (!snapshot) {
    return null
  }

  const { question, options, anonymous, phase } = snapshot
  const closed = phase === "closed"
  const sealed = !closed && snapshot.counts === undefined
  const counts = snapshot.counts ?? options.map(() => 0)
  const total = snapshot.total ?? 0
  // The room's own count when it has sent one; the lobby's list only fills in
  // the lobby and on a reconnect, so it misses a student who joined since.
  const players = playerTotal ?? lobbyPlayers

  const send = async (
    event:
      | typeof EVENTS.MANAGER.CLOSE_POLL
      | typeof EVENTS.MANAGER.DISMISS_POLL,
  ) => {
    if (pending || !gameId) {
      return
    }

    setPending(true)

    const outcome = await emitWithAck<PollOutcome>((ack) => {
      socket.emit(event, { gameId }, ack)
    })

    setPending(false)

    // The room's own state change is what closes or clears the screen; a
    // refusal or a silence leaves it up, and the host is told why.
    if (outcome !== "accepted") {
      toast.error(t(`poll:outcome.${outcome}`), { id: "poll-command" })
      socket.emit(EVENTS.POLL.SYNC, { gameId })
    }
  }

  return (
    <PollFrame
      backgroundUrl={backgroundUrl}
      labelledBy={QUESTION_ID}
      deckKeys={IS_DECK_EMBED}
    >
      {hostControls && (
        <div className="absolute top-4 left-4 z-10">
          <Button
            className="bg-surface border-border text-text-primary hover:bg-panel border px-4"
            disabled={pending}
            onClick={() => {
              void send(
                closed
                  ? EVENTS.MANAGER.DISMISS_POLL
                  : EVENTS.MANAGER.CLOSE_POLL,
              )
            }}
          >
            {closed ? t("poll:host.done") : t("poll:host.close")}
          </Button>
        </div>
      )}

      <main className="stage:max-w-[105rem] stage:gap-6 stage:px-0 stage:pb-[5.4rem] stage:pt-[5.5rem] mx-auto flex min-h-0 w-full flex-1 flex-col items-center gap-4 overflow-y-auto px-4 pt-20 pb-6">
        <header className="stage:gap-3 flex w-full flex-col items-center gap-2 text-center">
          <p className="text-brand stage:text-[1.5rem] text-xs font-bold tracking-[0.12em] uppercase">
            {closed ? t("poll:host.closedNote") : t("poll:label")}
            {" · "}
            <span className="text-text-muted">
              {anonymous
                ? t("poll:privacy.anonymous")
                : t("poll:privacy.named")}
            </span>
          </p>
          <h2
            id={QUESTION_ID}
            className={clsx(
              "text-text-primary leading-tight font-bold text-balance break-words",
              QUESTION_CLASSES[questionTier(question)],
            )}
          >
            {question}
          </h2>
          <p
            data-poll-voted
            className="text-text-muted stage:text-[2.6875rem] text-lg font-semibold"
          >
            {total === 0 && closed
              ? t("poll:noOneVoted")
              : t("poll:voted", { voted: total, total: players })}
          </p>
          {/* A label, like the one above the question: it tells the presenter
              what the screen is doing. The room does not have to read it, so
              it is not held to the room-readable size (STYLE.md). */}
          {sealed && (
            <p
              data-poll-sealed
              className="text-text-muted stage:text-[1.5rem] text-xs font-bold tracking-[0.12em] uppercase"
            >
              {t("poll:host.sealedNote")}
            </p>
          )}
        </header>

        <PollBars
          options={options}
          counts={counts}
          total={total}
          voters={IS_DECK_EMBED ? undefined : snapshot.voters}
          sealed={sealed}
        />
      </main>
    </PollFrame>
  )
}

export default HostPollOverlay
