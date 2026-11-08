import { EVENTS } from "@razzia/common/constants"
import ConfirmDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { openRehearsal } from "@razzia/web/features/rehearse/draft"
import QuizzBackgroundControl from "@razzia/web/features/quizz/components/QuizzBackgroundControl"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useBlocker, useNavigate } from "@tanstack/react-router"
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const SAVE_RETRY_MS = 10_000

const QuizzEditorHeader = () => {
  const {
    quizzId,
    subject,
    setSubject,
    questions,
    currentIndex,
    background,
    isDirty,
  } = useQuizzEditor()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const { t } = useTranslation()
  // A save sent and not yet answered: a second click must not send it again.
  const [saving, setSaving] = useState(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current)
      }
    },
    [],
  )

  // Reloading or closing the tab with unsaved edits asks first; in-app exits
  // go through the confirmation below instead.
  useEffect(() => {
    if (!isDirty) {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [isDirty])

  // Back, Forward and any other in-app exit with unsaved edits ask first.
  // The tab-close prompt above already covers a reload, so the blocker leaves
  // it out.
  const shouldBlockLeave = useCallback(() => isDirty, [isDirty])
  const blocker = useBlocker({
    shouldBlockFn: shouldBlockLeave,
    withResolver: true,
    enableBeforeUnload: false,
  })

  // Exit asks through its own dialog (or has nothing to ask), so it must not
  // be asked again by the blocker.
  const handleExit = () => {
    navigate({ to: "/manager", ignoreBlocker: true })
  }

  const handleLeaveDialogChange = (open: boolean) => {
    // Settling an already settled blocker is a no-op, so this is safe after a
    // confirm too.
    if (!open && blocker.status === "blocked") {
      blocker.reset()
    }
  }

  const handleConfirmLeave = () => {
    if (blocker.status === "blocked") {
      blocker.proceed()
    }
  }

  const handleChangeSubject = (e: ChangeEvent<HTMLInputElement>) => {
    setSubject(e.target.value)
  }

  // The quiz as it stands on screen, saved or not, played on the real screens.
  const handleRehearse = () => {
    const opened = openRehearsal({ subject, questions, at: currentIndex })

    if (!opened) {
      toast.error(t("quizz:rehearse.unavailable"))
    }
  }

  const handleSave = () => {
    if (saving) {
      return
    }

    setSaving(true)
    // A save lost on a dropped connection must not lock the button for good.
    retryTimer.current = setTimeout(() => setSaving(false), SAVE_RETRY_MS)

    const visuals = background ? { background } : undefined

    if (quizzId) {
      socket.emit(EVENTS.QUIZZ.UPDATE, {
        id: quizzId,
        subject,
        questions,
        visuals,
      })
    } else {
      socket.emit(EVENTS.QUIZZ.SAVE, { subject, questions, visuals })
    }
  }

  useEvent(EVENTS.QUIZZ.SAVE_SUCCESS, () => {
    toast.success(t("quizz:quizzSaved"))
    // Saved: isDirty is still true at this moment, but nothing is lost.
    navigate({ to: "/manager/config", ignoreBlocker: true })
  })

  useEvent(EVENTS.QUIZZ.UPDATE_SUCCESS, (_data) => {
    toast.success(t("quizz:quizzUpdated"))
    // Saved: isDirty is still true at this moment, but nothing is lost.
    navigate({ to: "/manager/config", ignoreBlocker: true })
  })

  useEvent(EVENTS.QUIZZ.ERROR, (message) => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
    }

    setSaving(false)
    toast.error(t(message))
  })

  return (
    <header className="bg-surface border-border z-20 flex h-14 items-center justify-between gap-4 border-b px-4">
      <div className="flex items-center gap-6">
        <Input
          variant="sm"
          className="w-64"
          value={subject}
          onChange={handleChangeSubject}
          placeholder={t("quizz:titleQuizzPlaceholder")}
        />
        <QuizzBackgroundControl />
      </div>

      <div className="flex gap-2">
        {isDirty ? (
          <ConfirmDialog
            trigger={
              <Button className="bg-panel border-border text-text-body text-md border px-4 py-2 font-semibold">
                {t("common:exit")}
              </Button>
            }
            title={t("quizz:unsaved.title")}
            description={t("quizz:unsaved.description")}
            confirmLabel={t("quizz:unsaved.discard")}
            onConfirm={handleExit}
          />
        ) : (
          <Button
            className="bg-panel border-border text-text-body text-md border px-4 py-2 font-semibold"
            onClick={handleExit}
          >
            {t("common:exit")}
          </Button>
        )}
        <Button
          className="bg-panel border-border text-text-body text-md border px-4 py-2 font-semibold"
          onClick={handleRehearse}
          title={t("quizz:rehearse.buttonHint")}
        >
          {t("quizz:rehearse.button")}
        </Button>
        <Button
          className="text-md px-4 py-2"
          onClick={handleSave}
          disabled={saving}
        >
          {t("common:save")}
        </Button>
      </div>
      <ConfirmDialog
        open={blocker.status === "blocked"}
        onOpenChange={handleLeaveDialogChange}
        title={t("quizz:unsaved.title")}
        description={t("quizz:unsaved.description")}
        confirmLabel={t("quizz:unsaved.discard")}
        onConfirm={handleConfirmLeave}
      />
    </header>
  )
}

export default QuizzEditorHeader
