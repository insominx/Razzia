import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import {
  RESULT_PHONE_DETAILS_MS,
  RESULT_STRIKE_MS,
} from "@razzia/common/utils/result-reveal"
import { score } from "@razzia/web/features/game/audio"
import FrameHit from "@razzia/web/features/game/components/FrameHit"
import Loader from "@razzia/web/components/Loader"
import { useResultClock } from "@razzia/web/features/game/hooks/use-result-clock"
import { useCalmVisuals } from "@razzia/web/features/game/hooks/use-show-intensity"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { HAPTIC, haptic } from "@razzia/web/features/game/utils/haptics"
import { formatRank } from "@razzia/web/features/game/utils/rank"
import clsx from "clsx"
import { Check, Minus, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["SHOW_RESULT"]
}

type Verdict = "right" | "wrong" | "none"

/** Right, wrong, or nothing picked: the last still gets told the answer. */
const verdictOf = (
  correct: boolean,
  picked: number | null | undefined,
): Verdict => {
  if (correct) {
    return "right"
  }

  return picked === null ? "none" : "wrong"
}

/** Colour and glyph carry the verdict on the first beat; words come after. */
const VERDICT_COLOR: Record<Verdict, string> = {
  right: "#34d98b",
  wrong: "#ff6a58",
  none: "#aab4c4",
}

const GLYPH = { right: Check, wrong: X, none: Minus } as const

/**
 * A phone's half of the staged verdict. It holds while the room builds up to
 * it, then on the same beat as the projector's strike it takes the verdict's
 * colour and a glyph and nothing else, so heads stay up. Two seconds later the
 * words arrive: the points, the streak, where you stand, and the right answer
 * if you missed it.
 */
const Result = ({
  data: {
    correct,
    message,
    points,
    myPoints,
    rank,
    aheadOfMe,
    note,
    resultsAt,
    serverNow,
    picked,
    correctAnswers,
    streak,
    behind,
  },
}: Props) => {
  const { t } = useTranslation()
  const calm = useCalmVisuals()
  const updatePoints = usePlayerStore((state) => state.updatePoints)
  const clock = useResultClock({ resultsAt, serverNow })
  // Decided once: a phone buzzes and sounds for a beat it is there to see. One
  // that wakes up or reconnects after the strike has missed it, and a buzz
  // that late would only be wrong.
  const [live] = useState(clock.elapsedMs < RESULT_STRIKE_MS)

  const struck = clock.elapsedMs >= RESULT_STRIKE_MS
  const detailed = clock.elapsedMs >= RESULT_PHONE_DETAILS_MS
  const verdict = verdictOf(correct, picked)
  const Glyph = GLYPH[verdict]
  const color = VERDICT_COLOR[verdict]

  useEffect(() => {
    if (struck && live) {
      haptic(correct ? HAPTIC.correct : HAPTIC.wrong)
    }
  }, [struck, live, correct])

  // The strike's own chord, stamped to the same moment as the room's: major if
  // you were right, minor if you were not. A phone that arrives late is silent.
  useEffect(() => {
    if (resultsAt === undefined || serverNow === undefined) {
      return
    }

    score.start(
      { scene: "strike", resultsAt, serverNow, outcome: verdict },
      { silent: !live },
    )
  }, [resultsAt, serverNow, verdict, live])

  // The footer's score would give the verdict away early, so it waits for the
  // details; leaving the screen settles it either way.
  useEffect(() => {
    if (detailed) {
      updatePoints(myPoints)
    }

    return () => {
      updatePoints(myPoints)
    }
  }, [detailed, myPoints, updatePoints])

  const stage = (() => {
    if (!struck) {
      return "hold"
    }

    return detailed ? "details" : "struck"
  })()
  const title = verdict === "none" ? t("game:noAnswer") : t(message)
  const place = formatRank(t, rank)
  // Level on points with the player listed ahead is a tie, not "behind" them,
  // as on the standing screen.
  const level = behind === 0

  return (
    <section
      data-result-stage={stage}
      data-verdict={verdict}
      style={{ "--rz-verdict": color } as React.CSSProperties}
      className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4"
    >
      {stage === "hold" && <Loader className="h-30" />}

      {stage === "struck" && !calm && (
        <FrameHit
          kind="verdict"
          color={color}
          elapsedMs={clock.elapsedMs - RESULT_STRIKE_MS}
        >
          <Glyph className="size-40 stroke-[3.5]" aria-label={title} />
        </FrameHit>
      )}

      {stage !== "hold" && (
        <div
          className={clsx(
            "flex flex-col items-center gap-3 text-center",
            stage === "details" && "animate-rz-fade-in",
          )}
        >
          <div
            className="grid size-32 place-items-center rounded-full text-black"
            style={{ background: color, boxShadow: `0 0 4rem ${color}88` }}
          >
            <Glyph className="size-20 stroke-[3.5]" aria-hidden="true" />
          </div>
          <h2
            data-verdict-title
            className="text-text-primary text-4xl font-bold"
          >
            {title}
          </h2>
        </div>
      )}

      {stage === "details" && (
        <div
          data-result-details
          className="animate-rz-fade-in mt-3 flex flex-col items-center gap-2 text-center"
        >
          {correct && (
            <p className="flex flex-wrap items-center justify-center gap-2">
              <span className="bg-success-tint border-success-border text-success rounded-rz-md border px-4 py-1 text-3xl font-bold">
                +{points}
              </span>
              {streak !== undefined && streak >= 2 && (
                <span className="bg-sequence-tint border-sequence-border text-sequence rounded-rz-md border px-3 py-1 text-lg font-bold">
                  {t("game:streak", { count: streak })}
                </span>
              )}
            </p>
          )}
          {!correct && correctAnswers && correctAnswers.length > 0 && (
            <div data-correct-answer className="flex flex-col items-center">
              <p className="text-text-muted text-sm font-bold tracking-[0.18em] uppercase">
                {t("game:itWas")}
              </p>
              <p className="text-text-primary text-xl font-bold">
                {correctAnswers.join(" / ")}
              </p>
            </div>
          )}
          <p className="text-text-primary text-xl font-bold">
            {aheadOfMe && !level
              ? t("game:standingBehind", { place, name: aheadOfMe })
              : t("game:standing", { place })}
          </p>
          {aheadOfMe && level && (
            <p className="text-text-muted text-base font-semibold">
              {t("game:standingLevel", { name: aheadOfMe })}
            </p>
          )}
          {note && (
            <p className="text-text-muted mt-4 max-w-md text-lg font-semibold">
              {t(note)}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export default Result
