import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import {
  getNextSentenceRevealElapsed,
  getQuestionPromptRevealMs,
  getVisibleSentenceCount,
  splitQuestionSentences,
} from "@razzia/common/utils/question-transition"
import { useEffect, useMemo, useState } from "react"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

const getPrefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(REDUCED_MOTION_QUERY).matches

export const useQuestionPrompt = (
  data: CommonStatusDataMap["SHOW_QUESTION"],
): { visibleCount: number; barDelayMs: number; shouldLift: boolean } => {
  const sentenceCount = splitQuestionSentences(data.question).length
  const revealMs = getQuestionPromptRevealMs(data.question)
  const [reducedMotion, setReducedMotion] = useState(getPrefersReducedMotion)
  const received = useMemo(
    () => ({ localNow: Date.now(), serverNow: data.serverNow }),
    [data.serverNow, data.promptStartedAt],
  )
  const initialElapsed = Math.max(0, data.serverNow - data.promptStartedAt)
  const [scheduledCount, setScheduledCount] = useState(() =>
    getVisibleSentenceCount(data.question, initialElapsed),
  )

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
    const handleChange = ({ matches }: MediaQueryListEvent) => {
      setReducedMotion(matches)
    }

    setReducedMotion(mediaQuery.matches)
    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [])

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null
    const elapsed = () =>
      Math.max(
        0,
        received.serverNow -
          data.promptStartedAt +
          (Date.now() - received.localNow),
      )
    const update = () => {
      const currentElapsed = elapsed()
      const nextScheduledCount = getVisibleSentenceCount(
        data.question,
        currentElapsed,
      )
      setScheduledCount(nextScheduledCount)

      const nextElapsed = getNextSentenceRevealElapsed(
        data.question,
        nextScheduledCount,
      )

      if (nextElapsed !== null) {
        timeout = setTimeout(update, Math.max(0, nextElapsed - currentElapsed))
      }
    }

    update()

    return () => {
      if (timeout !== null) {
        clearTimeout(timeout)
      }
    }
  }, [data.promptStartedAt, data.question, received])

  return {
    visibleCount: reducedMotion ? sentenceCount : scheduledCount,
    barDelayMs: revealMs - initialElapsed,
    shouldLift: initialElapsed === 0,
  }
}
