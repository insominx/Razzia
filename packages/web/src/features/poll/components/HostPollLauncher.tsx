import { EVENTS } from "@razzia/common/constants"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import type { PollOutcome } from "@razzia/common/types/poll"
import Button from "@razzia/web/components/Button"
import { IS_DECK_EMBED } from "@razzia/web/features/deck/embed"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { emitWithAck } from "@razzia/web/features/poll/utils/emit-with-ack"
import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// A poll may take the room in its lobby or between questions: the screens a
// lecture room rests on.
const RESTING_SCREENS = new Set<Status>([
  STATUS.SHOW_ROOM,
  STATUS.SHOW_RESPONSES,
  STATUS.SHOW_LEADERBOARD,
])

/**
 * The host's way to run a stored poll: a button under the main control that
 * opens the list. Only a lecture room at rest has one; during a question, or
 * while a poll is showing, there is nothing to launch.
 */
const HostPollLauncher = () => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const gameId = useManagerStore((state) => state.gameId)
  const lecture = useManagerStore((state) => state.lecture)
  const hostControls = useManagerStore((state) => state.hostControls)
  const screen = useManagerStore((state) => state.status?.name)
  const polls = useManagerStore((state) => state.config?.polls)
  const showing = usePollStore((state) => state.snapshot !== null)
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  // The list is asked for when it is opened, so a poll made a moment ago is in
  // it; the reply is the same config the manager pages keep.
  useEvent(EVENTS.MANAGER.CONFIG, (config) => {
    useManagerStore.getState().setConfig(config)
  })

  const available =
    Boolean(gameId) &&
    lecture !== null &&
    !lecture.finished &&
    hostControls &&
    !IS_DECK_EMBED &&
    !showing &&
    screen !== undefined &&
    RESTING_SCREENS.has(screen)

  useEffect(() => {
    if (!available) {
      setOpen(false)
    }
  }, [available])

  // Escape, or a click anywhere else, closes the list.
  useEffect(() => {
    if (!open) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }
    const onPress = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onPress)

    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onPress)
    }
  }, [open])

  if (!available || !gameId) {
    return null
  }

  const toggle = () => {
    if (!open) {
      socket.emit(EVENTS.MANAGER.GET_CONFIG)
    }

    setOpen(!open)
  }

  const start = async (pollId: string) => {
    if (starting) {
      return
    }

    setStarting(pollId)

    const outcome = await emitWithAck<PollOutcome>((ack) => {
      socket.emit(EVENTS.MANAGER.START_POLL, { gameId, pollId }, ack)
    })

    setStarting(null)

    if (outcome === "accepted") {
      setOpen(false)

      return
    }

    // Every other answer leaves the room as it was, and says why.
    toast.error(t(`poll:outcome.${outcome}`), { id: "poll-command" })

    if (outcome === "notFound") {
      socket.emit(EVENTS.MANAGER.GET_CONFIG)
    }
  }

  return (
    <div ref={root} className="fixed top-[4.25rem] left-4 z-30">
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        className="bg-surface border-border text-text-primary hover:bg-panel border px-4"
        onClick={toggle}
      >
        {t("poll:launcher.button")}
      </Button>

      {open && (
        <div
          role="menu"
          aria-label={t("poll:launcher.title")}
          className="bg-surface border-border rounded-rz-lg animate-rz-fade-in mt-2 flex max-h-[60vh] w-[24rem] max-w-[90vw] flex-col gap-1 overflow-y-auto border p-2"
        >
          <p className="text-text-muted px-2 pt-1 text-xs font-bold tracking-[0.12em] uppercase">
            {t("poll:launcher.title")}
          </p>

          {(polls ?? []).length === 0 && (
            <p className="text-text-muted p-2 text-sm">
              {t("poll:launcher.empty")}
            </p>
          )}

          {(polls ?? []).map((poll) => (
            <button
              key={poll.id}
              type="button"
              role="menuitem"
              disabled={starting !== null}
              className="hover:bg-panel rounded-rz-md ease-calm flex flex-col gap-1 p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                void start(poll.id)
              }}
            >
              <span className="text-text-primary line-clamp-2 font-semibold">
                {poll.question}
              </span>
              <span className="text-text-muted text-xs">
                {t("poll:launcher.options", { count: poll.optionCount })}
                {" · "}
                {poll.anonymous
                  ? t("poll:launcher.anonymous")
                  : t("poll:launcher.named")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default HostPollLauncher
