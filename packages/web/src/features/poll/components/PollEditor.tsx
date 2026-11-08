import * as Switch from "@radix-ui/react-switch"
import { EVENTS } from "@razzia/common/constants"
import type { PollWithId } from "@razzia/common/types/poll"
import { POLL_LIMITS, pollValidator } from "@razzia/common/validators/poll"
import ConfirmDialog from "@razzia/web/components/AlertDialog"
import AutoGrowTextarea from "@razzia/web/components/AutoGrowTextarea"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { newPollId } from "@razzia/web/features/poll/new-poll-id"
import { LETTERS } from "@razzia/web/features/poll/utils/letters"
import { mayNotFitStage } from "@razzia/web/features/poll/utils/stage-fit"
import { useBlocker, useNavigate } from "@tanstack/react-router"
import { Minus, Plus } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { v7 as uuid } from "uuid"

const SAVE_RETRY_MS = 10_000

interface OptionDraft {
  // For React only: a removed row must not hand its place to the next one.
  key: string
  text: string
}

interface Props {
  // The poll being changed; absent for a new one.
  initial?: PollWithId
}

const startingOptions = (initial?: PollWithId): OptionDraft[] =>
  (initial?.options ?? ["", ""]).map((text) => ({ key: uuid(), text }))

// What Save sends, so retyping the original text reads as clean again.
const snapshot = (
  question: string,
  options: OptionDraft[],
  anonymous: boolean,
) =>
  JSON.stringify({
    question,
    options: options.map((option) => option.text),
    anonymous,
  })

/**
 * One poll's editor: its question, two to six options, and whether votes are
 * anonymous. It names a new poll once, when it opens, so every try at saving
 * it lands on the same poll (as the quiz editor does for a quiz).
 */
const PollEditor = ({ initial }: Props) => {
  const { socket } = useSocket()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [question, setQuestion] = useState(initial?.question ?? "")
  const [options, setOptions] = useState(() => startingOptions(initial))
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? true)
  // A save sent and not yet answered: a second click must not send it again.
  const [saving, setSaving] = useState(false)
  const [showProblem, setShowProblem] = useState(false)
  const [newId] = useState(newPollId)
  const [initialSnapshot] = useState(() =>
    snapshot(question, options, anonymous),
  )
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty = snapshot(question, options, anonymous) !== initialSnapshot
  const poll = {
    question,
    options: options.map((option) => option.text),
    anonymous,
  }
  const validation = pollValidator.safeParse(poll)
  const problem = validation.success ? null : validation.error.issues[0].message
  const mayNotFit = mayNotFitStage({
    question: question.trim(),
    options: poll.options.map((text) => text.trim()).filter(Boolean),
    anonymous,
  })

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
  const shouldBlockLeave = useCallback(() => isDirty, [isDirty])
  const blocker = useBlocker({
    shouldBlockFn: shouldBlockLeave,
    withResolver: true,
    enableBeforeUnload: false,
  })

  // Exit asks through its own dialog (or has nothing to ask), so it must not
  // be asked again by the blocker.
  const handleExit = () => {
    navigate({ to: "/manager/config", ignoreBlocker: true })
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

  const setOptionText = (key: string, text: string) => {
    setOptions((all) =>
      all.map((option) => (option.key === key ? { ...option, text } : option)),
    )
  }

  const addOption = () => {
    if (options.length < POLL_LIMITS.MAX_OPTIONS) {
      setOptions((all) => [...all, { key: uuid(), text: "" }])
    }
  }

  const removeOption = (key: string) => {
    if (options.length > POLL_LIMITS.MIN_OPTIONS) {
      setOptions((all) => all.filter((option) => option.key !== key))
    }
  }

  const handleSave = () => {
    if (saving) {
      return
    }

    // The same rules the server applies, so a mistake is named here, at once.
    if (!validation.success) {
      setShowProblem(true)

      return
    }

    setSaving(true)
    // A save lost on a dropped connection must not lock the button for good.
    retryTimer.current = setTimeout(() => {
      setSaving(false)
    }, SAVE_RETRY_MS)

    if (initial) {
      socket.emit(EVENTS.POLLS.UPDATE, { id: initial.id, ...validation.data })
    } else {
      // Named once, when the editor opened: every try at saving this poll
      // lands on the same poll.
      socket.emit(EVENTS.POLLS.SAVE, { id: newId, ...validation.data })
    }
  }

  useEvent(EVENTS.POLLS.SAVE_SUCCESS, () => {
    toast.success(t("poll:editor.saved"))
    // Saved: isDirty is still true at this moment, but nothing is lost.
    navigate({ to: "/manager/config", ignoreBlocker: true })
  })

  useEvent(EVENTS.POLLS.UPDATE_SUCCESS, () => {
    toast.success(t("poll:editor.updated"))
    navigate({ to: "/manager/config", ignoreBlocker: true })
  })

  useEvent(EVENTS.POLLS.ERROR, (message) => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
    }

    setSaving(false)
    toast.error(t(message))
  })

  const exitButton = (
    <Button className="bg-panel border-border text-text-body text-md border px-4 py-2 font-semibold">
      {t("common:exit")}
    </Button>
  )

  return (
    <div className="bg-canvas text-text-body relative flex h-svh flex-col">
      <header className="bg-surface border-border z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
        <h1 className="text-text-primary text-lg font-semibold">
          {initial ? t("poll:editor.editTitle") : t("poll:editor.newTitle")}
        </h1>

        <div className="flex gap-2">
          {isDirty ? (
            <ConfirmDialog
              trigger={exitButton}
              title={t("poll:editor.unsaved.title")}
              description={t("poll:editor.unsaved.description")}
              confirmLabel={t("poll:editor.unsaved.discard")}
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
            className="text-md px-4 py-2"
            onClick={handleSave}
            disabled={saving}
          >
            {t("common:save")}
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
          <section className="flex flex-col gap-2">
            <label
              htmlFor="poll-question"
              className="text-text-body text-sm font-semibold"
            >
              {t("poll:editor.questionLabel")}
            </label>
            <div className="bg-surface border-border rounded-rz-lg border">
              <AutoGrowTextarea
                id="poll-question"
                className="text-text-primary placeholder:text-text-muted block w-full bg-transparent p-4 text-xl font-semibold outline-none"
                placeholder={t("poll:editor.questionPlaceholder")}
                maxLength={POLL_LIMITS.QUESTION}
                value={question}
                onValueChange={setQuestion}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-text-body text-sm font-semibold">
              {t("poll:editor.optionsLabel")}
            </p>
            <ul className="flex flex-col gap-2">
              {options.map((option, index) => (
                <li key={option.key} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="bg-panel border-border text-text-primary rounded-rz-md grid size-10 shrink-0 place-items-center border font-mono font-bold"
                  >
                    {LETTERS[index]}
                  </span>
                  <Input
                    aria-label={t("poll:editor.optionPlaceholder", {
                      letter: LETTERS[index],
                    })}
                    className="min-w-0 flex-1"
                    placeholder={t("poll:editor.optionPlaceholder", {
                      letter: LETTERS[index],
                    })}
                    maxLength={POLL_LIMITS.OPTION}
                    value={option.text}
                    onChange={(event) => {
                      setOptionText(option.key, event.target.value)
                    }}
                  />
                  <button
                    type="button"
                    aria-label={t("poll:editor.removeOption", {
                      letter: LETTERS[index],
                    })}
                    disabled={options.length <= POLL_LIMITS.MIN_OPTIONS}
                    className="text-text-muted hover:bg-panel hover:text-text-body rounded-rz-sm p-2 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => {
                      removeOption(option.key)
                    }}
                  >
                    <Minus className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3">
              <p className="text-text-faint text-xs">
                {t("poll:editor.optionsHint")}
              </p>
              <Button
                className="bg-panel border-border text-text-body border px-3 py-1.5 text-sm"
                disabled={options.length >= POLL_LIMITS.MAX_OPTIONS}
                onClick={addOption}
              >
                <Plus className="size-4" />
                {t("poll:editor.addOption")}
              </Button>
            </div>
          </section>

          <section className="bg-surface border-border rounded-rz-lg flex items-start justify-between gap-4 border p-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="poll-anonymous"
                className="text-text-primary text-sm font-semibold"
              >
                {t("poll:editor.anonymousLabel")}
              </label>
              <p className="text-text-muted text-sm">
                {anonymous
                  ? t("poll:editor.anonymousOn")
                  : t("poll:editor.anonymousOff")}
              </p>
            </div>
            <Switch.Root
              id="poll-anonymous"
              checked={anonymous}
              onCheckedChange={setAnonymous}
              className="bg-panel focus-visible:outline-brand data-[state=checked]:bg-brand ease-calm relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-2"
            >
              <Switch.Thumb className="bg-surface border-border ease-calm block size-4 translate-x-0.5 rounded-full border transition-transform data-[state=checked]:translate-x-4.5" />
            </Switch.Root>
          </section>

          {mayNotFit && (
            <p
              role="status"
              data-fit-warning="stage"
              className="text-warning border-border rounded-rz-md border px-4 py-2 text-sm font-semibold"
            >
              {t("poll:editor.fitWarning")}
            </p>
          )}

          {showProblem && problem && (
            <p role="alert" className="text-danger text-sm font-semibold">
              {t(problem)}
            </p>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={blocker.status === "blocked"}
        onOpenChange={handleLeaveDialogChange}
        title={t("poll:editor.unsaved.title")}
        description={t("poll:editor.unsaved.description")}
        confirmLabel={t("poll:editor.unsaved.discard")}
        onConfirm={handleConfirmLeave}
      />
    </div>
  )
}

export default PollEditor
