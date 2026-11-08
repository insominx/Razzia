import { EVENTS } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import clsx from "clsx"
import { Check } from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ConfigSelectQuizz = () => {
  const { socket } = useSocket()
  const { quizz: quizzList } = useConfig()
  const [picked, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const { t } = useTranslation()
  // The list is asked for again after a reconnect: a quizz that is gone from
  // it is no longer chosen, so Start never sends an id the server dropped.
  const selected = quizzList.some((quizz) => quizz.id === picked)
    ? picked
    : null

  useEvent(EVENTS.GAME.ERROR_MESSAGE, (message) => {
    setCreating(false)
    toast.error(t(message))
  })

  const handleSelect = (id: string) => () => {
    if (selected === id) {
      setSelected(null)
    } else {
      setSelected(id)
    }
  }

  // A normal game closes its lobby when it starts. A lecture room stays open
  // between questions, so students can join late and the host can run polls.
  const handleCreate =
    (event: typeof EVENTS.GAME.CREATE | typeof EVENTS.GAME.CREATE_LECTURE) =>
    () => {
      if (creating) {
        return
      }

      if (!selected) {
        toast.error(t("manager:quizz.pleaseSelect"))

        return
      }

      // Success navigates to the new game, so only an error unlocks this.
      setCreating(true)
      socket.emit(event, selected)
    }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {quizzList.length > 0 && (
        <div
          className="mb-4 shrink-0"
          title={selected ? undefined : t("manager:quizz.pleaseSelect")}
        >
          <div className="flex gap-2">
            <Button
              className={clsx(
                "border-brand-border bg-brand-tint text-brand flex-1 border",
                !selected && "pointer-events-none",
              )}
              disabled={!selected || creating}
              onClick={handleCreate(EVENTS.GAME.CREATE)}
            >
              {t("manager:quizz.startGame")}
            </Button>
            <Button
              className={clsx(
                "bg-surface border-border text-text-primary hover:bg-panel flex-1 border",
                !selected && "pointer-events-none",
              )}
              disabled={!selected || creating}
              onClick={handleCreate(EVENTS.GAME.CREATE_LECTURE)}
            >
              {t("manager:quizz.startLecture")}
            </Button>
          </div>
          <p
            data-lecture-hint
            className="text-text-muted mt-2 text-xs font-normal"
          >
            {t("manager:quizz.lectureHint")}
          </p>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-0.5">
        {quizzList.map((quizz) => (
          <button
            key={quizz.id}
            aria-pressed={selected === quizz.id}
            className={clsx(
              "rounded-rz-md ease-calm flex w-full items-center justify-between gap-3 border p-3 text-left transition-colors duration-[var(--rz-dur-fast)]",
              selected === quizz.id
                ? "border-brand-border bg-brand-tint text-brand"
                : "border-border bg-surface hover:bg-panel",
            )}
            onClick={handleSelect(quizz.id)}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{quizz.subject}</span>
              {quizz.questionCount !== undefined && (
                <span
                  data-question-count
                  className="text-text-muted text-sm font-normal"
                >
                  {t("manager:quizz.questionCount", {
                    count: quizz.questionCount,
                  })}
                </span>
              )}
            </span>

            <div
              className={clsx(
                "border-border text-text-muted rounded-rz-sm size-5 shrink-0 border p-0.5",
                selected === quizz.id &&
                  "border-brand-border bg-brand-tint text-brand",
              )}
            >
              {selected === quizz.id && (
                <Check className="size-full stroke-4" />
              )}
            </div>
          </button>
        ))}
        {!quizzList.length && (
          <div className="text-text-muted my-8 text-center">
            <p>{t("manager:quizz.notFound")}</p>
            <p className="text-sm">{t("manager:quizz.pleaseCreate")}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConfigSelectQuizz
