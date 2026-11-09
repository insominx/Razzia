import { EVENTS } from "@razzia/common/constants"
import type { PollResultRecord } from "@razzia/common/types/poll"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { emitMutation } from "@razzia/web/features/manager/emit-mutation"
import PollResultModal from "@razzia/web/features/poll/components/PollResultModal"
import { formatResultDate } from "@razzia/web/features/poll/utils/format-date"
import { useNavigate } from "@tanstack/react-router"
import { SquarePen, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

/**
 * The Polls tab: the polls a host has stored, to make, change and delete, and
 * below them what the polls that were run left behind.
 */
const ConfigManagePolls = () => {
  const { polls, pollResults } = useConfig()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingResultId, setDeletingResultId] = useState<string | null>(null)
  const [openResult, setOpenResult] = useState<PollResultRecord | null>(null)
  const { t } = useTranslation()

  // A poll's result is saved while the host is in the room, after this page
  // last had its config. Ask again each time the tab opens, so the list is the
  // server's and not what it was at login.
  useEffect(() => {
    socket.emit(EVENTS.MANAGER.GET_CONFIG)
  }, [socket])

  useEvent(EVENTS.POLLS.ERROR, (message) => {
    toast.error(t(message))
  })

  useEvent(EVENTS.POLLS.RESULT_DATA, setOpenResult)

  const closeResult = useCallback(() => {
    setOpenResult(null)
  }, [])

  const handleDelete = (id: string) => () => {
    if (deletingId) {
      return
    }

    setDeletingId(id)
    emitMutation(socket, [EVENTS.POLLS.DELETE, id], (response) => {
      setDeletingId(null)

      if (!response) {
        toast.error(t("errors:poll.failedToDelete"))
      } else if ("error" in response) {
        toast.error(t(response.error))
      } else {
        toast.success(t("manager:polls.deleted"))
      }
    })
  }

  const handleDeleteResult = (id: string) => () => {
    if (deletingResultId) {
      return
    }

    setDeletingResultId(id)
    emitMutation(socket, [EVENTS.POLLS.RESULT_DELETE, id], (response) => {
      setDeletingResultId(null)

      if (!response) {
        toast.error(t("errors:poll.failedToDeleteResult"))
      } else if ("error" in response) {
        toast.error(t(response.error))
      } else {
        toast.success(t("manager:polls.resultDeleted"))
      }
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 gap-2">
        <Button
          className="border-brand-border bg-brand-tint text-brand flex-1 border"
          onClick={() => navigate({ to: "/manager/polls" })}
        >
          {t("manager:polls.create")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-0.5">
        {polls.map((poll) => (
          <div
            key={poll.id}
            data-poll-row={poll.id}
            className="border-border bg-surface rounded-rz-md flex min-h-14 w-full items-center justify-between gap-2 border py-2 pr-1.5 pl-3"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate">{poll.question}</p>
              <p className="text-text-muted text-sm">
                {t("poll:launcher.options", { count: poll.optionCount })}
                {" · "}
                {poll.anonymous
                  ? t("poll:launcher.anonymous")
                  : t("poll:launcher.named")}
                {poll.live && ` · ${t("poll:launcher.live")}`}
              </p>
            </div>

            <div className="flex shrink-0 gap-0.5">
              <button
                aria-label={t("poll:editor.editTitle")}
                title={t("poll:editor.editTitle")}
                className="text-text-muted hover:bg-panel hover:text-text-body rounded-rz-sm p-2 disabled:opacity-50"
                disabled={deletingId === poll.id}
                onClick={() =>
                  navigate({
                    to: "/manager/polls/$pollId",
                    params: { pollId: poll.id },
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
                title={t("manager:polls.delete")}
                description={t("manager:polls.deleteConfirm", {
                  name: poll.question,
                })}
                confirmLabel={t("common:delete")}
                onConfirm={handleDelete(poll.id)}
              />
            </div>
          </div>
        ))}

        {polls.length === 0 && (
          <p className="text-text-muted my-8 text-center">
            {t("manager:polls.none")}
          </p>
        )}

        {pollResults.length > 0 && (
          <section className="pt-4">
            <h3 className="text-text-muted mb-2 px-1 text-xs font-bold tracking-[0.12em] uppercase">
              {t("manager:polls.resultsTitle")}
            </h3>
            <div className="space-y-2">
              {pollResults.map((result) => (
                <div
                  key={result.id}
                  data-poll-result={result.id}
                  className="border-border bg-surface rounded-rz-md flex w-full items-center justify-between border px-3 py-2.5"
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    disabled={deletingResultId === result.id}
                    onClick={() => {
                      socket.emit(EVENTS.POLLS.RESULT_GET, result.id)
                    }}
                  >
                    <p className="truncate font-medium">{result.question}</p>
                    <p className="text-text-faint text-xs">
                      {formatResultDate(result.date)}
                      {" - "}
                      {t("manager:polls.resultVotes", { count: result.total })}
                      {result.partial && (
                        <span
                          data-partial
                          className="border-border bg-panel text-text-muted rounded-rz-sm ml-1.5 border px-1.5 py-0.5"
                        >
                          {t("manager:polls.resultPartial")}
                        </span>
                      )}
                    </p>
                  </button>

                  <AlertDialog
                    trigger={
                      <button
                        className="hover:bg-danger-tint rounded-rz-sm p-2 disabled:opacity-50"
                        disabled={deletingResultId !== null}
                        aria-label={t("manager:polls.resultDelete")}
                      >
                        <Trash2 className="text-danger size-4" />
                      </button>
                    }
                    title={t("manager:polls.resultDelete")}
                    description={t("manager:polls.resultDeleteConfirm", {
                      name: result.question,
                    })}
                    confirmLabel={t("common:delete")}
                    onConfirm={handleDeleteResult(result.id)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {openResult && (
        <PollResultModal result={openResult} onClose={closeResult} />
      )}
    </div>
  )
}

export default ConfigManagePolls
