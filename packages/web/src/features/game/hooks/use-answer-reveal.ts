import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import {
  getNextAnswerRevealElapsed,
  getVisibleAnswerCount,
} from "@razzia/common/utils/answer-reveal"
import { useEffect, useMemo, useState } from "react"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

const getPrefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(REDUCED_MOTION_QUERY).matches

export const useAnswerReveal = (
  data: CommonStatusDataMap["SELECT_ANSWER"],
): number => {
  const answerCount = data.answers.length
  const [reducedMotion, setReducedMotion] = useState(getPrefersReducedMotion)
  const received = useMemo(
    () => ({ localNow: Date.now(), serverNow: data.serverNow }),
    // `revealStartedAt` is a reset key: a new round re-stamps the receipt time.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [data.serverNow, data.revealStartedAt],
  )
  const initialElapsed = Math.max(0, data.serverNow - data.revealStartedAt)
  const [scheduledCount, setScheduledCount] = useState(() =>
    getVisibleAnswerCount(answerCount, initialElapsed),
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
    if (data.answeringOpen) {
      return
    }

    let timeout: ReturnType<typeof setTimeout> | null = null
    const elapsed = () =>
      Math.max(
        0,
        received.serverNow -
          data.revealStartedAt +
          (Date.now() - received.localNow),
      )
    const update = () => {
      const currentElapsed = elapsed()
      const nextScheduledCount = getVisibleAnswerCount(
        answerCount,
        currentElapsed,
      )
      setScheduledCount(nextScheduledCount)

      const nextElapsed = getNextAnswerRevealElapsed(
        answerCount,
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
  }, [answerCount, data.answeringOpen, data.revealStartedAt, received])

  return data.answeringOpen || reducedMotion ? answerCount : scheduledCount
}
