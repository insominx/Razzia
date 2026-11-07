import type { ShowIntensity } from "@razzia/common/types/visuals"
import { createFakeSocket } from "@razzia/web/features/rehearse/fake-socket"
import { loadDraft, tidyDraft } from "@razzia/web/features/rehearse/draft"
import FrameStage from "@razzia/web/features/rehearse/FrameStage"
import {
  boundedIndex,
  type FixtureId,
  isFixtureId,
  pickForQuestion,
  type ScreenView,
  statusForQuestion,
} from "@razzia/web/features/rehearse/screens"
import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"

/** What the frame says to the rehearsal page that holds it. */
export const REHEARSAL_SOURCE = "razzia-rehearsal-frame"

/** The keys the rehearsal page answers to; the frame passes them up. */
export const REHEARSAL_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "r",
  "R",
  "p",
  "P",
])

interface Props {
  view: ScreenView
  fixture: string
  /** 0-based. */
  q: number
  intensity: ShowIntensity
}

/**
 * One screen of the draft quiz, at the size of the frame it runs in. The page
 * around it picks the screen and reloads the frame to play it again.
 */
const RehearsalFrame = ({ view, fixture, q, intensity }: Props) => {
  const { t } = useTranslation()
  const fake = useMemo(() => createFakeSocket(), [])
  const content = useMemo(() => {
    const draft = loadDraft()

    return draft
      ? tidyDraft(draft, {
          subject: t("quizz:rehearse.placeholder.subject"),
          question: t("quizz:rehearse.placeholder.question"),
          answer: t("quizz:rehearse.placeholder.answer"),
        })
      : null
  }, [t])

  // A frame is not where focus stays in a clicker-and-keyboard rehearsal, so
  // the keys the page answers to are passed up to it.
  useEffect(() => {
    const forward = (event: KeyboardEvent) => {
      if (
        REHEARSAL_KEYS.has(event.key) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        window.parent.postMessage(
          { source: REHEARSAL_SOURCE, key: event.key },
          window.location.origin,
        )
      }
    }

    window.addEventListener("keydown", forward)

    return () => {
      window.removeEventListener("keydown", forward)
    }
  }, [])

  // The host's Next button sends the game on; here it sends the rehearsal on.
  useEffect(() => {
    if (view !== "host") {
      return
    }

    return fake.onEmit(() => {
      window.parent.postMessage(
        { source: REHEARSAL_SOURCE, key: "ArrowRight" },
        window.location.origin,
      )
    })
  }, [fake, view])

  const id: FixtureId = isFixtureId(fixture) ? fixture : "answers"
  const at = content ? boundedIndex(q, content.questions.length) : 0
  const status = useMemo(
    () => (content ? statusForQuestion(id, content, at) : null),
    [content, id, at],
  )

  if (!content || !status) {
    return (
      <p className="text-text-muted m-auto p-8 text-xl">
        {t("quizz:rehearse.empty")}
      </p>
    )
  }

  return (
    <FrameStage
      view={view}
      dialect="dark-everywhere"
      surface="stage"
      intensity={intensity}
      status={status}
      mount={0}
      fake={fake}
      seed={{
        progress: { current: at + 1, total: content.questions.length },
        pick: pickForQuestion(id, content, at),
      }}
    />
  )
}

export default RehearsalFrame
