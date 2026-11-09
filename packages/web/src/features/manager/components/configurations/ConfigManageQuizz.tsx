import { EVENTS } from "@razzia/common/constants"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { emitMutation } from "@razzia/web/features/manager/emit-mutation"
import { newQuizzId } from "@razzia/web/features/quizz/new-quizz-id"
import { useNavigate } from "@tanstack/react-router"
import { RotateCcw, SquarePen, Trash2, Upload } from "lucide-react"
import { type ChangeEvent, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// The socket server drops any message over 1 MB (and the connection with it),
// so a bigger file is refused here, where the reason can be shown.
const IMPORT_MAX_BYTES = 900_000

const ConfigManageQuizz = () => {
  const { quizz } = useConfig()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const { t } = useTranslation()

  useEvent(EVENTS.QUIZZ.ERROR, (message) => {
    toast.error(t(message))
  })

  const handleDelete = (id: string) => () => {
    if (deletingId) {
      return
    }

    setDeletingId(id)
    emitMutation(socket, [EVENTS.QUIZZ.DELETE, id], (response) => {
      setDeletingId(null)

      if (!response) {
        toast.error(t("errors:quizz.failedToDelete"))
      } else if ("error" in response) {
        toast.error(t(response.error))
      } else {
        toast.success(t("manager:quizz.deleted"))
      }
    })
  }

  const handleRestore = (id: string) => () => {
    if (restoringId) {
      return
    }

    setRestoringId(id)
    emitMutation(socket, [EVENTS.QUIZZ.RESTORE, id], (response) => {
      setRestoringId(null)

      if (!response) {
        toast.error(t("errors:quizz.failedToRestore"))
      } else if ("error" in response) {
        toast.error(t(response.error))
      } else {
        toast.success(t("manager:quizz.restored"))
      }
    })
  }

  const hasEdited = quizz.some((q) => q.seedState === "edited")

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    if (file.size > IMPORT_MAX_BYTES) {
      toast.error(t("manager:quizz.importTooLarge"))
      e.target.value = ""

      return
    }

    const reader = new FileReader()

    reader.onerror = () => {
      toast.error(t("manager:quizz.invalidJson"))
    }

    reader.onload = (event) => {
      try {
        const data: unknown = JSON.parse(event.target?.result as string)

        // Named here, once per file picked, as the editor names a new quiz.
        socket.emit(EVENTS.QUIZZ.SAVE, {
          ...(typeof data === "object" && data !== null ? data : {}),
          id: newQuizzId(),
        })
      } catch {
        toast.error(t("manager:quizz.invalidJson"))
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
      {hasEdited && (
        <p
          className="border-border bg-panel text-text-muted rounded-rz-md mb-3 shrink-0 border px-3 py-2 text-sm"
          data-testid="seed-note"
        >
          {t("manager:quizz.editedNote")}
        </p>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-0.5">
        {quizz.map((q) => (
          <div
            key={q.id}
            className="border-border bg-surface rounded-rz-md flex h-12 w-full items-center justify-between border pr-1.5 pl-3"
          >
            <p className="min-w-0 flex-1 truncate">{q.subject}</p>
            {q.seedState === "edited" && (
              <span
                className="border-border bg-panel text-text-muted rounded-rz-sm mr-1 shrink-0 border px-1.5 py-0.5 text-xs"
                title={t("manager:quizz.editedTitle")}
              >
                {t("manager:quizz.edited")}
              </span>
            )}
            <div className="flex gap-0.5">
              {q.seedState === "edited" && (
                <AlertDialog
                  trigger={
                    <button
                      className="text-text-muted hover:bg-panel hover:text-text-body rounded-rz-sm p-2 disabled:opacity-50"
                      disabled={restoringId !== null || deletingId !== null}
                      aria-label={t("manager:quizz.restore")}
                      title={t("manager:quizz.restore")}
                    >
                      <RotateCcw className="size-4" />
                    </button>
                  }
                  title={t("manager:quizz.restore")}
                  description={t("manager:quizz.restoreConfirm", {
                    name: q.subject,
                  })}
                  confirmLabel={t("manager:quizz.restoreAction")}
                  onConfirm={handleRestore(q.id)}
                />
              )}
              <button
                className="text-text-muted hover:bg-panel hover:text-text-body rounded-rz-sm p-2 disabled:opacity-50"
                disabled={deletingId === q.id}
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
                  <button
                    className="hover:bg-danger-tint rounded-rz-sm p-2 disabled:opacity-50"
                    disabled={deletingId !== null}
                    aria-label={t("common:delete")}
                  >
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
