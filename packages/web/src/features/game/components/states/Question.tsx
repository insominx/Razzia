import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { readingSpec, score } from "@razzia/web/features/game/audio"
import ChargeLine from "@razzia/web/features/game/components/ChargeLine"
import QuestionCard from "@razzia/web/features/game/components/QuestionCard"
import QuestionNumber from "@razzia/web/features/game/components/QuestionNumber"
import { useQuestionPrompt } from "@razzia/web/features/game/hooks/use-question-prompt"
import { useSceneArrival } from "@razzia/web/features/game/hooks/use-scene-arrival"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { questionSegment } from "@razzia/web/features/game/utils/charge-line"
import { useEffect, useRef } from "react"

interface Props {
  data: CommonStatusDataMap["SHOW_QUESTION"]
}

const Question = ({ data }: Props) => {
  const { questionNumber, question, media, cooldown, answerCount } = data
  const { visibleCount, barDelayMs, shouldLift } = useQuestionPrompt(data)
  // A reviewed question must not cut the live game's bed.
  const reviewing = useManagerStore((state) => state.review !== null)
  const arrived = useSceneArrival(data.serverNow)
  const promptScroll = useRef<HTMLDivElement>(null)

  // Near silence while the prompt appears, then the charge for the cooldown.
  // Asked again when a review ends, it stays on the clock it arrived with.
  useEffect(() => {
    score.start(arrived(readingSpec(data)), { silent: reviewing })
  }, [data, reviewing, arrived])

  // On a phone the prompt scrolls; it follows the text as each sentence lands.
  useEffect(() => {
    const scroller = promptScroll.current

    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight
    }
  }, [visibleCount])

  return (
    <section className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="stage:max-w-[105rem] mx-auto flex min-h-0 w-full flex-1 flex-col">
        <div
          ref={promptScroll}
          data-fit-box
          className="stage:overflow-visible stage:px-0 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4"
        >
          <div className="stage:gap-3 stage:py-0 my-auto flex w-full flex-col items-center gap-2 py-2">
            <QuestionNumber questionNumber={questionNumber} />
            <QuestionCard
              question={question}
              media={media}
              reveal
              visibleCount={visibleCount}
              shouldLift={shouldLift}
            />
          </div>
        </div>

        {/* The line charges where the clock row will be, once the prompt has
            been read. Below it, the room the answers will fill is held empty,
            so the prompt sits exactly where it will when they arrive. */}
        <div className="stage:h-28 relative h-0">
          <ChargeLine
            mode="grow"
            segment={questionSegment(cooldown, answerCount)}
            delayMs={barDelayMs}
          />
        </div>
        <div
          aria-hidden="true"
          className="stage:block stage:h-[28rem] hidden"
        />
        <div
          aria-hidden="true"
          className="stage:block stage:h-[5.4rem] hidden"
        />
      </div>
    </section>
  )
}

export default Question
