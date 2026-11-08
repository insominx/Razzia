import type { ShowIntensity } from "@razzia/common/types/visuals"
import {
  type Draft,
  loadDraft,
  parseDraft,
  REHEARSAL_KEY,
  tidyDraft,
} from "@razzia/web/features/rehearse/draft"
import { REHEARSAL_SOURCE } from "@razzia/web/features/rehearse/RehearsalFrame"
import {
  type FixtureId,
  type ScreenView,
} from "@razzia/web/features/rehearse/screens"
import { questionFitProblems } from "@razzia/web/features/game/utils/question-fit"
import clsx from "clsx"
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RotateCw,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

/** What each side of the game shows, in the order a question plays. */
export const REHEARSAL_SCREENS = {
  host: ["question", "answers", "reveal", "reveal-wrong"],
  phone: [
    "question",
    "answers",
    "wait",
    "verdict",
    "verdict-wrong",
    "verdict-none",
  ],
} as const satisfies Record<ScreenView, readonly FixtureId[]>

const SIZES: Record<ScreenView, { width: number; height: number }> = {
  host: { width: 1920, height: 1080 },
  phone: { width: 390, height: 844 },
}

const INTENSITIES: readonly ShowIntensity[] = ["full", "calm", "silent"]

const useBox = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current

    if (!element) {
      return
    }

    setBox({ width: element.clientWidth, height: element.clientHeight })

    const observer = new ResizeObserver(([entry]) => {
      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  return { ref, ...box }
}

const isTextEntry = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

interface ChipProps {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  label?: string
}

const Chip = ({ active = false, onClick, children, label }: ChipProps) => (
  <button
    type="button"
    aria-pressed={active}
    aria-label={label}
    onClick={onClick}
    className={clsx(
      "rounded-rz-md ease-calm focus-visible:outline-text-primary inline-flex items-center gap-1.5 border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
      active
        ? "border-brand bg-brand/15 text-text-primary"
        : "bg-panel border-border text-text-body hover:brightness-110",
    )}
  >
    {children}
  </button>
)

/**
 * The editor's rehearsal: the quiz as it stands on the editor's screen, played
 * through the real screens at the projector's size and a phone's, with no game
 * and no server. The editor saves the draft; this page reads it, and a second
 * Rehearse from the editor refreshes it in place.
 */
const RehearsalPage = () => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Draft | null>(() => loadDraft())
  const [view, setView] = useState<ScreenView>("host")
  const [screen, setScreen] = useState(1)
  const [question, setQuestion] = useState(() => draft?.at ?? 0)
  const [intensity, setIntensity] = useState<ShowIntensity>("full")
  // A new value reloads the frame, which plays the screen's entrance again.
  const [replay, setReplay] = useState(0)
  const stage = useBox()

  const tidy = useMemo(
    () =>
      draft
        ? tidyDraft(draft, {
            subject: t("quizz:rehearse.placeholder.subject"),
            question: t("quizz:rehearse.placeholder.question"),
            answer: t("quizz:rehearse.placeholder.answer"),
          })
        : null,
    [draft, t],
  )
  const total = tidy?.questions.length ?? 0
  const screens = REHEARSAL_SCREENS[view]
  const fixture = screens[Math.min(screen, screens.length - 1)]
  const at = Math.min(question, Math.max(0, total - 1))
  const size = SIZES[view]
  const scale =
    stage.width > 0 && stage.height > 0
      ? Math.min(1, stage.width / size.width, stage.height / size.height)
      : 0
  const problems = tidy ? questionFitProblems(tidy.questions[at]) : []

  const step = (delta: number) => {
    const next = screen + delta

    if (next >= 0 && next < screens.length) {
      setScreen(next)
    } else if (delta > 0 && at < total - 1) {
      setQuestion(at + 1)
      setScreen(0)
    } else if (delta < 0 && at > 0) {
      setQuestion(at - 1)
      setScreen(screens.length - 1)
    }
  }

  const move = (delta: number) => {
    setQuestion(Math.min(Math.max(0, at + delta), Math.max(0, total - 1)))
    setScreen(0)
  }

  const switchView = (next: ScreenView) => {
    // The same moment of the question on the other side of the game.
    const same = REHEARSAL_SCREENS[next].indexOf(fixture as never)

    setView(next)
    setScreen(same === -1 ? 1 : same)
  }

  // Another Rehearse from the editor saves a new draft; show it in place.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === REHEARSAL_KEY) {
        setDraft(parseDraft(event.newValue))
        setReplay((previous) => previous + 1)
      }
    }

    window.addEventListener("storage", onStorage)

    return () => {
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const act = (key: string) => {
    const replayNow = () => {
      setReplay((previous) => previous + 1)
    }
    const toggleView = () => {
      switchView(view === "host" ? "phone" : "host")
    }
    const actions: Partial<Record<string, () => void>> = {
      ArrowRight: () => {
        step(1)
      },
      ArrowLeft: () => {
        step(-1)
      },
      ArrowDown: () => {
        move(1)
      },
      ArrowUp: () => {
        move(-1)
      },
      r: replayNow,
      R: replayNow,
      p: toggleView,
      P: toggleView,
    }

    actions[key]?.()
  }

  // Keys work whether the page or the frame has focus.
  const latest = useRef(act)

  latest.current = act

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Each repeat would reload the whole frame again.
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTextEntry(event.target)
      ) {
        return
      }

      latest.current(event.key)
    }
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data

      if (
        event.origin === window.location.origin &&
        typeof data === "object" &&
        data !== null &&
        "source" in data &&
        data.source === REHEARSAL_SOURCE &&
        "key" in data &&
        typeof data.key === "string"
      ) {
        latest.current(data.key)
      }
    }

    window.addEventListener("keydown", onKey)
    window.addEventListener("message", onMessage)

    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("message", onMessage)
    }
  }, [])

  if (!tidy) {
    return (
      <main className="bg-canvas text-text-body flex h-svh items-center justify-center p-8">
        <p className="max-w-md text-center text-lg">
          {t("quizz:rehearse.empty")}
        </p>
      </main>
    )
  }

  const src = `/rehearse/frame?${new URLSearchParams({
    view,
    fixture,
    q: String(at),
    intensity,
    n: String(replay),
  }).toString()}`

  return (
    <main className="bg-canvas text-text-body flex h-svh flex-col">
      <header className="bg-surface border-border flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-2">
        <h1 className="text-text-primary max-w-[18rem] truncate text-base font-bold">
          {t("quizz:rehearse.title", { subject: tidy.subject })}
        </h1>

        <div className="flex items-center gap-1.5">
          <Chip
            onClick={() => {
              move(-1)
            }}
            label={t("quizz:rehearse.previousQuestion")}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Chip>
          <span className="min-w-28 text-center text-sm font-semibold tabular-nums">
            {t("quizz:rehearse.questionOf", { current: at + 1, total })}
          </span>
          <Chip
            onClick={() => {
              move(1)
            }}
            label={t("quizz:rehearse.nextQuestion")}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Chip>
        </div>

        <div className="flex gap-1.5">
          {(["host", "phone"] as const).map((side) => (
            <Chip
              key={side}
              active={view === side}
              onClick={() => {
                switchView(side)
              }}
            >
              {t(`quizz:rehearse.view.${side}`)}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {screens.map((id, index) => (
            <Chip
              key={id}
              active={id === fixture}
              onClick={() => {
                setScreen(index)
              }}
            >
              {t(`quizz:rehearse.screens.${id}`)}
            </Chip>
          ))}
          <Chip
            onClick={() => {
              setReplay((previous) => previous + 1)
            }}
          >
            <RotateCw className="size-4" aria-hidden="true" />
            {t("quizz:rehearse.replay")}
          </Chip>
        </div>

        <label className="ml-auto flex items-center gap-2 text-sm font-semibold">
          {t("manager:visuals.showIntensity.label")}
          <select
            value={intensity}
            onChange={(event) => {
              // The options are the three levels, so the value is one of them.
              setIntensity(event.target.value as ShowIntensity)
            }}
            className="bg-panel border-border rounded-rz-md border px-2 py-1.5"
          >
            {INTENSITIES.map((level) => (
              <option key={level} value={level}>
                {t(`manager:visuals.showIntensity.${level}.title`)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {problems.length > 0 && (
        <ul
          data-fit-problems
          className="bg-warning-tint text-warning border-border flex flex-col gap-0.5 border-b px-4 py-2 text-sm font-semibold"
        >
          {problems.map((problem) => (
            <li key={problem} className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {t(`quizz:fitWarning.${problem}`)}
            </li>
          ))}
        </ul>
      )}

      <div
        ref={stage.ref}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3"
      >
        <div
          className="border-border relative shrink-0 overflow-hidden rounded-md border"
          style={{ width: size.width * scale, height: size.height * scale }}
        >
          {scale > 0 && (
            <iframe
              key={src}
              src={src}
              title={t("quizz:rehearse.frameTitle")}
              width={size.width}
              height={size.height}
              className="absolute top-0 left-0 origin-top-left border-0"
              style={{ transform: `scale(${scale})` }}
            />
          )}
        </div>
      </div>

      <footer className="text-text-muted border-border border-t px-4 py-1.5 text-xs">
        {t("quizz:rehearse.keys")}
      </footer>
    </main>
  )
}

export default RehearsalPage
