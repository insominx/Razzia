import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import QuestionCard from "@razzia/web/features/game/components/QuestionCard"
import QuestionNumber from "@razzia/web/features/game/components/QuestionNumber"
import { useQuestionPrompt } from "@razzia/web/features/game/hooks/use-question-prompt"
import { useSfx } from "@razzia/web/features/game/hooks/use-sfx"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { useEffect } from "react"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_QUESTION"]
}

const Question = ({ data }: Props) => {
  const { questionNumber, question, media, cooldown } = data
  const { visibleCount, barDelayMs, shouldLift } = useQuestionPrompt(data)
  const sfx = useSfx()
  const [sfxShow] = useSound(sfx(SFX.SHOW_SOUND), { volume: 0.5 })

  useEffect(() => {
    sfxShow()
  }, [sfxShow])

  return (
    <section className="relative mx-auto flex h-full w-full max-w-7xl flex-1 flex-col items-center px-4">
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-4">
        <QuestionNumber questionNumber={questionNumber} />
        <QuestionCard
          question={question}
          media={media}
          reveal
          visibleCount={visibleCount}
          shouldLift={shouldLift}
        />
      </div>
      <div
        className="bg-brand mb-20 h-4 self-start justify-self-end rounded-full"
        style={{
          animation: `progressBar ${cooldown}s linear ${barDelayMs}ms both`,
        }}
      ></div>
    </section>
  )
}

export default Question
