import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { score } from "@razzia/web/features/game/audio"
import FrameHit from "@razzia/web/features/game/components/FrameHit"
import QuestionNumber from "@razzia/web/features/game/components/QuestionNumber"
import RoundPips from "@razzia/web/features/game/components/RoundPips"
import { useCalmVisuals } from "@razzia/web/features/game/hooks/use-show-intensity"
import { useLaunchStore } from "@razzia/web/features/game/stores/launch"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import clsx from "clsx"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["SHOW_PREPARED"]
}

/** GO holds the frame this long. */
const GO_MS = 900

/**
 * The round card: which question this is, how far through the quiz, and, on the
 * last one, that it is the last. The first card after the countdown also takes
 * the frame with GO.
 */
const Prepared = ({ data: { questionNumber } }: Props) => {
  const { t } = useTranslation()
  const calm = useCalmVisuals()
  const total = useQuestionStore((state) => state.questionStates?.total)
  const [go, setGo] = useState(false)
  const known = total !== undefined && total > 1
  const final = known && questionNumber === total

  // The whoosh of a new card; the first card's GO is the countdown's own.
  useEffect(() => {
    score.start({ scene: "roundCard" })
  }, [])

  useEffect(() => {
    if (!useLaunchStore.getState().consume()) {
      return
    }

    setGo(true)

    const timer = setTimeout(() => setGo(false), GO_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [])

  return (
    <section className="stage:gap-10 relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center gap-6">
      {go && !calm && (
        <FrameHit kind="go">
          <span data-go>{t("game:go")}</span>
        </FrameHit>
      )}

      <QuestionNumber questionNumber={questionNumber} intro />

      <p
        data-round-number
        data-final={final ? "" : undefined}
        className={clsx(
          "animate-rz-enter stage:text-[18rem] text-[9rem] leading-none font-extrabold tabular-nums",
          final ? "text-warning" : "text-text-primary",
        )}
      >
        {questionNumber}
      </p>

      {known && <RoundPips current={questionNumber} total={total} />}
    </section>
  )
}

export default Prepared
