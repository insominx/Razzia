import type { PollResultRecord } from "@razzia/common/types/poll"
import PollBars from "@razzia/web/features/poll/components/PollBars"
import { formatResultDate } from "@razzia/web/features/poll/utils/format-date"
import { X } from "lucide-react"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

const TITLE_ID = "poll-result-title"

interface Props {
  result: PollResultRecord
  onClose: () => void
}

/** A closed poll as it ended: every option's votes, and the names if it was named. */
const PollResultModal = ({ result, onClose }: Props) => {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement>(null)
  // The caller's latest close, so a new function each render does not restart
  // the effect below (which would reset the focus and the scroll lock).
  const latestClose = useRef(onClose)

  useEffect(() => {
    latestClose.current = onClose
  })

  // The page behind does not scroll under it, and Escape closes it.
  useEffect(() => {
    document.body.style.overflow = "hidden"
    panel.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        latestClose.current()
      }
    }

    document.addEventListener("keydown", onKey)

    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  return (
    <div className="bg-overlay fixed inset-0 z-60 flex items-center justify-center p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        className="bg-surface border-border text-text-body rounded-rz-lg flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border outline-none"
      >
        <header className="border-border flex items-start justify-between gap-4 border-b p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id={TITLE_ID}
              className="text-text-primary text-lg font-semibold break-words"
            >
              {result.question}
            </h2>
            <p className="text-text-muted text-sm">
              {formatResultDate(result.date)}
              {" · "}
              {t("poll:result.subject", { subject: result.gameSubject })}
              {" · "}
              {t("manager:polls.resultVotes", { count: result.total })}
            </p>
            <p className="text-text-faint text-xs">
              {result.anonymous
                ? t("poll:privacy.anonymous")
                : t("poll:privacy.named")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("poll:result.close")}
            title={t("poll:result.close")}
            className="text-text-muted hover:bg-panel hover:text-text-body rounded-rz-sm shrink-0 p-2"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {result.partial && (
            <p
              role="note"
              data-partial-note
              className="text-warning border-border rounded-rz-md border px-3 py-2 text-sm font-semibold"
            >
              {t("poll:result.partialNote")}
            </p>
          )}
          <PollBars
            options={result.options}
            counts={result.counts}
            total={result.total}
            voters={result.voters}
            namesLimit={Number.POSITIVE_INFINITY}
          />
        </div>
      </div>
    </div>
  )
}

export default PollResultModal
