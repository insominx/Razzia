import { EVENTS } from "@razzia/common/constants"
import type { DirectorApi } from "@razzia/web/features/dev/director-api"
import { waitStatus } from "@razzia/web/features/dev/fixtures"
import {
  type RoundStep,
  type RoundStepId,
  scheduleAfter,
} from "@razzia/web/features/dev/round"
import { ANSWERS_LABELS } from "@razzia/web/features/game/utils/game-constants"
import { useEffect, useMemo, useRef, useState } from "react"

export interface LogEntry {
  id: number
  /** Milliseconds since the round began. */
  at: number
  text: string
}

interface Options {
  steps: readonly RoundStep[]
  host: DirectorApi | null
  phone: DirectorApi | null
  /** The host pressed Next on the leaderboard. */
  onNextQuestion: () => void
}

const MAX_LOG = 40

/**
 * Plays a planned round into the host and phone frames, and answers them as
 * the server would: a tapped tile gets the phone its waiting screen, and the
 * host's own Skip and Next buttons move the round along.
 */
export const useRoundRunner = ({
  steps,
  host,
  phone,
  onNextQuestion,
}: Options) => {
  const [current, setCurrent] = useState<RoundStepId | null>(null)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])

  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const start = useRef(0)
  const choice = useRef<number | null>(null)
  const logId = useRef(0)
  // Handlers outlive renders, so they read the current options from here.
  const latest = useRef({ steps, host, phone, onNextQuestion })

  latest.current = { steps, host, phone, onNextQuestion }

  // Built once: everything it touches is a ref or a state setter, so a render
  // never changes what `play` and `stop` do, and callers may depend on them.
  const controller = useMemo(() => {
    const append = (text: string) => {
      logId.current += 1

      const entry = { id: logId.current, at: Date.now() - start.current, text }

      setLog((previous) => [...previous.slice(-(MAX_LOG - 1)), entry])
    }

    const clearTimers = () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }

    const dispatch = (step: RoundStep) => {
      const { host: hostApi, phone: phoneApi } = latest.current
      const messages = step.messages({
        start: start.current,
        now: Date.now(),
        choice: choice.current,
      })

      for (const message of messages) {
        const targets = [
          ...(message.to === "phone" ? [] : [["host", hostApi] as const]),
          ...(message.to === "host" ? [] : [["phone", phoneApi] as const]),
        ]

        for (const [name, api] of targets) {
          if (message.kind === "event") {
            // Ticks and answer counts would bury everything else in the log.
            api?.deliver(message.event, ...message.args)
          } else {
            api?.showStatus(message.status)
            append(`${name} shows ${message.status.name}`)
          }
        }
      }

      if (step.milestone) {
        setCurrent(step.id)
      }
    }

    const jump = (index: number) => {
      const { steps: plan } = latest.current
      // `plan.at(-1)` would be the last step, not "no such step".
      const target = index >= 0 ? plan[index] : undefined

      if (!target) {
        return
      }

      clearTimers()

      // Landing on a step puts t=0 where it would have been, so what the step
      // stamps ("answers opened 12 s ago") is true. The host's Next keeps the
      // clock it has.
      if (!target.manual || start.current === 0) {
        start.current = Date.now() - target.at
      }

      const openAt = plan.find((step) => step.id === "open")?.at ?? 0

      if (target.at <= openAt) {
        choice.current = null
      }

      // Skipping ahead still tells the screens which question this is.
      if (index > 0) {
        for (const message of plan[0].messages({
          start: start.current,
          now: Date.now(),
          choice: choice.current,
        })) {
          if (message.kind === "event") {
            latest.current.host?.deliver(message.event, ...message.args)
            latest.current.phone?.deliver(message.event, ...message.args)
          }
        }
      }

      dispatch(target)

      const upcoming = scheduleAfter(plan, index)

      upcoming.forEach(({ step, delayMs }, position) => {
        timers.current.push(
          setTimeout(() => {
            dispatch(step)

            if (position === upcoming.length - 1) {
              setRunning(false)
            }
          }, delayMs),
        )
      })
      setRunning(upcoming.length > 0)
    }

    const play = () => {
      setLog([])
      start.current = 0
      jump(0)
    }

    const stop = () => {
      clearTimers()
      setRunning(false)
    }

    const jumpTo = (id: RoundStepId) => {
      jump(latest.current.steps.findIndex((step) => step.id === id))
    }

    return { append, play, stop, jumpTo }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { append, play, stop, jumpTo } = controller

  useEffect(() => {
    if (!phone) {
      return
    }

    return phone.onEmit((event, ...args) => {
      if (event !== EVENTS.PLAYER.SELECTED_ANSWER) {
        return
      }

      const { data } = args[0] as { data: { answerKey: number } }

      choice.current = data.answerKey
      phone.showStatus(waitStatus())
      append(`phone tapped ${ANSWERS_LABELS[data.answerKey]}`)
    })
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [phone])

  useEffect(() => {
    if (!host) {
      return
    }

    // The host's buttons, and where each one takes the round.
    const buttons: Record<string, { label: string; step: RoundStepId }> = {
      [EVENTS.MANAGER.UNLOCK_ANSWERS]: { label: "Skip", step: "open" },
      [EVENTS.MANAGER.ABORT_QUIZ]: { label: "Skip", step: "results" },
      [EVENTS.MANAGER.SHOW_LEADERBOARD]: { label: "Next", step: "leaderboard" },
    }

    return host.onEmit((event) => {
      if (event === EVENTS.MANAGER.NEXT_QUESTION) {
        append("host pressed Next")
        latest.current.onNextQuestion()

        return
      }

      const button = buttons[event] as (typeof buttons)[string] | undefined

      if (button) {
        append(`host pressed ${button.label}`)
        jumpTo(button.step)
      }
    })
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [host])

  // Leaving the tab must not leave timers pushing into dead frames.
  useEffect(() => stop, [stop])

  return { current, running, log, play, stop, jumpTo }
}
