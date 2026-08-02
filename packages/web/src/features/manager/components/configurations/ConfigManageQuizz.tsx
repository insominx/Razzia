import { EVENTS } from "@razzia/common/constants"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { useNavigate } from "@tanstack/react-router"
import { SquarePen, Trash2, Upload } from "lucide-react"
import { type ChangeEvent, useRef } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ConfigManageQuizz = () => {
  const { quizz } = useConfig()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()

  useEvent(EVENTS.QUIZZ.ERROR, (message) => {
    toast.error(t(message))
  })

  const handleDelete = (id: string) => () => {
    socket.emit(EVENTS.QUIZZ.DELETE, id)
    toast.success(t("manager:quizz.deleted"))
  }

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data: unknown = JSON.parse(event.target?.result as string)
        socket.emit(EVENTS.QUIZZ.SAVE, data)
      } catch {
        toast.error("Invalid JSON file")
      }
    }

    reader.readAsText(file)
    e.target.value = ""
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 gap-2">
        <Button
          className="border-brand-border bg-brand-tint text-brand flex-1 border"
          onClick={() => navigate({ to: "/manager/quizz" })}
        >
          {t("manager:quizz.create")}
        </Button>
        <Button
          className="border-border bg-panel text-text-body aspect-square border px-3"
          onClick={() => fileInputRef.current?.click()}
          title={t("manager:quizz.import")}
        >
          <Upload className="size-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-0.5">
        {quizz.map((q) => (
          <div
            key={q.id}
            className="border-border bg-surface rounded-rz-md flex h-12 w-full items-center justify-between border pr-1.5 pl-3"
          >
            <p className="truncate">{q.subject}</p>
            <div className="flex gap-0.5">
              <button
                className="text-text-muted hover:bg-panel hover:text-text-body rounded-rz-sm p-2"
                onClick={() =>
                  navigate({
                    to: "/manager/quizz/$quizzId",
                    params: { quizzId: q.id },
                  })
                }
              >
                <SquarePen className="size-4" />
              </button>

              <AlertDialog
                trigger={
                  <button className="hover:bg-danger-tint rounded-rz-sm p-2">
                    <Trash2 className="text-danger size-4" />
                  </button>
                }
                title={t("manager:quizz.delete")}
                description={t("manager:quizz.deleteConfirm", {
                  name: q.subject,
                })}
                confirmLabel={t("common:delete")}
                onConfirm={handleDelete(q.id)}
              />
            </div>
          </div>
        ))}
        {quizz.length === 0 && (
          <p className="text-text-muted my-8 text-center">
            {t("manager:quizz.none")}
          </p>
        )}
      </div>
    </div>
  )
}

export default ConfigManageQuizz
