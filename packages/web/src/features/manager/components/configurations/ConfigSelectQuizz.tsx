import { EVENTS } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import clsx from "clsx"
import { Check } from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ConfigSelectQuizz = () => {
  const { socket } = useSocket()
  const { quizz: quizzList } = useConfig()
  const [selected, setSelected] = useState<string | null>(null)
  const { t } = useTranslation()

  const handleSelect = (id: string) => () => {
    if (selected === id) {
      setSelected(null)
    } else {
      setSelected(id)
    }
  }

  const handleSubmit = () => {
    if (!selected) {
      toast.error(t("manager:quizz.pleaseSelect"))

      return
    }

    socket.emit(EVENTS.GAME.CREATE, selected)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {quizzList.length > 0 && (
        <div
          className="mb-4 shrink-0"
          title={selected ? undefined : t("manager:quizz.pleaseSelect")}
        >
          <Button
            className={clsx(
              "border-brand-border bg-brand-tint text-brand w-full border",
              !selected && "pointer-events-none",
            )}
            disabled={!selected}
            onClick={handleSubmit}
          >
            {t("manager:quizz.startGame")}
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-0.5">
        {quizzList.map((quizz) => (
          <button
            key={quizz.id}
            className="border-border bg-surface hover:bg-panel flex w-full items-center justify-between rounded-rz-md border p-3 transition-colors duration-[var(--rz-dur-fast)] ease-calm"
            onClick={handleSelect(quizz.id)}
          >
            {quizz.subject}

            <div
              className={clsx(
                "border-border text-text-muted size-5 rounded-rz-sm border p-0.5",
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
