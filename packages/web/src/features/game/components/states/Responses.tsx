import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import {
  getRailOrder,
  getRailStartMs,
  RESULT_FASTEST_MS,
  RESULT_HEADLINE_MS,
  RESULT_RAIL_GROW_MS,
  RESULT_STRIKE_MS,
} from "@razzia/common/utils/result-reveal"
import { score, verdictSpec } from "@razzia/web/features/game/audio"
import AnswerTile from "@razzia/web/features/game/components/AnswerTile"
import FrameHit from "@razzia/web/features/game/components/FrameHit"
import QuestionCard from "@razzia/web/features/game/components/QuestionCard"
import QuestionNumber from "@razzia/web/features/game/components/QuestionNumber"
import { useResultClock } from "@razzia/web/features/game/hooks/use-result-clock"
import { useCalmVisuals } from "@razzia/web/features/game/hooks/use-show-intensity"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import {
  ANSWER_GRID_TRACKS,
  ANSWERS_LABELS,
  answerSlotPlacement,
} from "@razzia/web/features/game/utils/constants"
import {
  analyzeCrowd,
  headlineFor,
  listLetters,
} from "@razzia/web/features/game/utils/reveal-copy"
import { voteShares } from "@razzia/web/features/game/utils/score"
import { answerVars } from "@razzia/web/features/game/utils/type-tier"
import clsx from "clsx"
import { useReducedMotion } from "motion/react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
}

interface Rect {
  top: number
  right: number
  bottom: number
  left: number
}

const easeOut = (progress: number) => 1 - (1 - progress) ** 3

/** Flood type for the right answers: one fills the frame, several share it. */
const FLOOD_TYPE = [
  "text-[8rem]",
  "text-[5.5rem]",
  "text-[4.25rem]",
  "text-[3.5rem]",
]

/**
 * The results, staged on one clock. TIME takes the frame; the rails then grow
 * from the letter blocks, smallest first, and the shares count up inside them;
 * everything but the most-picked answer goes dark; then the right answer
 * floods the frame, collapses into its tile, and the headline names who was
 * fooled. A screen that arrives after all that (a reconnect, a lecture review)
 * is simply the final grid, with no flood and no sound.
 */
const Responses = ({
  data: {
    questionNumber,
    question,
    answers,
    media,
    responses,
    solutions,
    totalPlayers,
    fastest,
    resultsAt,
    serverNow,
  },
}: Props) => {
  const { t, i18n } = useTranslation()
  const calm = useCalmVisuals()
  const reducedMotion = useReducedMotion()
  const clock = useResultClock({ resultsAt, serverNow })
  const { elapsedMs, phase } = clock
  const grid = useRef<HTMLDivElement>(null)
  const [floodFrom, setFloodFrom] = useState<Rect | null>(null)

  const shares = voteShares(responses, answers.length)
  const crowd = analyzeCrowd(responses, solutions, {
    answerCount: answers.length,
    totalPlayers,
  })
  const headline = headlineFor(crowd)
  const railOrder = getRailOrder(shares.map((share) => share.count))
  const verdict = phase === "strike" || phase === "settled"

  // A reviewed question must not cut the live game's bed.
  const reviewing = useManagerStore((state) => state.review !== null)

  // TIME, the count's ticks, the spotlight's heartbeat and the strike are one
  // scene, scheduled from the server's stamps: a screen that arrives after them
  // (a reconnect) finds them in the past and plays nothing.
  useEffect(() => {
    // A saved result with no stamps has no verdict to stage.
    if (resultsAt === undefined || serverNow === undefined) {
      return
    }

    score.start(
      verdictSpec({
        resultsAt,
        serverNow,
        responses,
        solutions,
        answerCount: answers.length,
      }),
      { silent: reviewing },
    )
  }, [resultsAt, serverNow, responses, solutions, answers.length, reviewing])

  // The flood leaves the right tile, so it needs to know where that is. The
  // tile has just been marked correct in this same commit.
  useLayoutEffect(() => {
    if (phase !== "strike" || calm) {
      return
    }

    const tile = grid.current?.querySelector<HTMLElement>(
      '[data-state="correct"]',
    )

    if (!tile) {
      return
    }

    const box = tile.getBoundingClientRect()

    setFloodFrom({
      top: Math.round(box.top),
      right: Math.round(window.innerWidth - box.right),
      bottom: Math.round(window.innerHeight - box.bottom),
      left: Math.round(box.left),
    })
  }, [phase, calm])

  const shareFor = (slot: number) => {
    const { count, percent } = shares[slot]

    if (phase === "time") {
      return undefined
    }

    if (reducedMotion || phase !== "count") {
      return { count, percent }
    }

    const start = getRailStartMs(railOrder.indexOf(slot))
    const progress = Math.min(
      1,
      Math.max(0, (elapsedMs - start) / RESULT_RAIL_GROW_MS),
    )

    return { count, percent: Math.round(percent * easeOut(progress)) }
  }

  const tileState = (slot: number) => {
    if (!verdict) {
      return "result"
    }

    return solutions.includes(slot) ? "correct" : "wrong"
  }

  const headlineText = t(`game:reveal.headline.${headline.kind}`, {
    right: headline.right,
    of: headline.of,
    wrong: headline.wrong,
    letters: listLetters(headline.letters, i18n.language),
  })
  const timeText = t(crowd.allIn ? "game:reveal.allIn" : "game:reveal.time")

  return (
    <section
      data-response-screen
      data-reveal=""
      data-phase={phase}
      data-calm={calm ? "" : undefined}
      className="relative flex min-h-0 w-full flex-1 flex-col"
    >
      {phase === "time" && !calm && (
        <FrameHit kind="time" elapsedMs={elapsedMs}>
          {timeText}
        </FrameHit>
      )}

      {phase === "strike" && !calm && floodFrom && (
        <FrameHit
          kind="strike"
          from={floodFrom}
          elapsedMs={elapsedMs - RESULT_STRIKE_MS}
        >
          <div className="flex flex-col gap-10">
            {solutions.map((slot) => (
              <div
                key={slot}
                className={clsx(
                  "rz-flood-answer",
                  FLOOD_TYPE[Math.min(solutions.length, FLOOD_TYPE.length) - 1],
                )}
              >
                <span className="rz-flood-letter">{ANSWERS_LABELS[slot]}</span>
                <span className="max-w-[60rem] text-[0.5em] leading-tight font-semibold">
                  {answers[slot]}
                </span>
              </div>
            ))}
          </div>
        </FrameHit>
      )}

      <div className="stage:max-w-[105rem] mx-auto flex min-h-0 w-full flex-1 flex-col">
        <div
          data-fit-box
          className="stage:overflow-visible stage:px-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-4"
        >
          <div className="stage:gap-3 stage:py-0 my-auto flex w-full flex-col items-center gap-2 py-2">
            <QuestionNumber questionNumber={questionNumber} />
            <QuestionCard question={question} media={media} />
          </div>
        </div>

        {/* Where the clock and the count were: the headline lands here. */}
        <div className="stage:h-28 stage:px-0 relative flex h-14 items-center justify-center px-4">
          {calm && phase === "time" ? (
            <p
              data-time-label
              className="text-warning stage:text-[3.5rem] text-[2rem] font-extrabold tracking-[0.12em]"
            >
              {timeText}
            </p>
          ) : (
            <p
              data-headline
              data-shown={elapsedMs >= RESULT_HEADLINE_MS ? "" : undefined}
              className="rz-headline text-text-primary stage:text-[2.75rem] text-center text-lg leading-tight font-bold text-balance"
            >
              {headlineText}
            </p>
          )}
          {fastest && (
            <p
              data-fastest
              data-shown={elapsedMs >= RESULT_FASTEST_MS ? "" : undefined}
              className="rz-headline text-text-muted stage:right-0 stage:text-[1.375rem] absolute right-4 bottom-0 text-sm font-semibold"
            >
              {t("game:reveal.fastest", {
                name: fastest.username,
                seconds: fastest.seconds,
              })}
            </p>
          )}
        </div>

        <div
          ref={grid}
          data-response-grid
          className={clsx(
            "stage:gap-4 stage:px-0 stage:pb-0 grid gap-2 px-3 pb-3",
            ANSWER_GRID_TRACKS.stage,
          )}
          style={answerVars(answers)}
        >
          {answers.map((answer, key) => (
            <AnswerTile
              key={key}
              index={key}
              state={tileState(key)}
              share={shareFor(key)}
              spot={phase === "spotlight" && crowd.top.includes(key)}
              className={answerSlotPlacement(key, answers.length)}
            >
              {answer}
            </AnswerTile>
          ))}
        </div>

        <div
          aria-hidden="true"
          className="stage:block stage:h-[5.4rem] hidden"
        />
      </div>
    </section>
  )
}

export default Responses
