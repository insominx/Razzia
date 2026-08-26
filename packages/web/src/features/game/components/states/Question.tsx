import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { QUESTION_CONTENT_ENTER_MS } from "@razzia/common/utils/question-transition"
import QuestionCard from "@razzia/web/features/game/components/QuestionCard"
import QuestionNumber from "@razzia/web/features/game/components/QuestionNumber"
import { useSfx } from "@razzia/web/features/game/hooks/use-sfx"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { useEffect } from "react"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_QUESTION"]
}

const Question = ({
  data: { questionNumber, question, media, cooldown },
}: Props) => {
  const sfx = useSfx()
  const [sfxShow] = useSound(sfx(SFX.SHOW_SOUND), { volume: 0.5 })

  useEffect(() => {
    sfxShow()
  }, [sfxShow])

  return (
    <section className="relative mx-auto flex h-full w-full max-w-7xl flex-1 flex-col items-center px-4">
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-4">
        <QuestionNumber questionNumber={questionNumber} />
        <QuestionCard question={question} media={media} reveal />
      </div>
      <div
        className="bg-brand mb-20 h-4 self-start justify-self-end rounded-full"
        style={{
          animation: `progressBar ${cooldown}s linear ${QUESTION_CONTENT_ENTER_MS}ms both`,
        }}
      ></div>
    </section>
  )
}

export default Question
