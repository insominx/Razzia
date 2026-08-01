import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import {
  ANSWER_BADGE_COLORS,
  ANSWERS_COLORS,
  ANSWERS_LABELS,
  SFX,
} from "@razzia/web/features/game/utils/constants"
import { calculatePercentages } from "@razzia/web/features/game/utils/score"
import clsx from "clsx"
import { useEffect, useState } from "react"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
}

const Responses = ({
  data: { question, answers, responses, solutions },
}: Props) => {
  const [percentages, setPercentages] = useState<Record<string, string>>({})
  const [isMusicPlaying, setIsMusicPlaying] = useState(false)

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, {
    volume: 0.2,
  })

  const [playMusic, { stop: stopMusic }] = useSound(SFX.ANSWERS.MUSIC, {
    volume: 0.2,
    onplay: () => {
      setIsMusicPlaying(true)
    },
    onend: () => {
      setIsMusicPlaying(false)
    },
  })

  useEffect(() => {
    stopMusic()
    sfxResults()

    setPercentages(calculatePercentages(responses))
  }, [responses, playMusic, stopMusic, sfxResults])

  useEffect(() => {
    if (!isMusicPlaying) {
      playMusic()
    }
  }, [isMusicPlaying, playMusic])

  useEffect(() => {
    stopMusic()
  }, [playMusic, stopMusic])

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5">
        <h2 className="text-text-primary text-center text-2xl font-bold md:text-4xl lg:text-5xl">
          {question}
        </h2>

        <div
          className={`mt-8 grid h-40 w-full max-w-3xl gap-4 px-2`}
          style={{ gridTemplateColumns: `repeat(${answers.length}, 1fr)` }}
        >
          {answers.map((_, key) => (
            <div
              key={key}
              className={clsx(
                "rounded-rz-md flex flex-col justify-end self-end overflow-hidden border-2",
                ANSWERS_COLORS[key],
              )}
              style={{ height: percentages[key] }}
            >
              <span className="bg-canvas/60 text-text-primary w-full text-center text-lg font-bold">
                {responses[key] || 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-2 gap-1 rounded-full px-2 text-lg font-bold md:text-xl">
          {answers.map((answer, key) => (
            <AnswerButton
              key={key}
              className={clsx(ANSWERS_COLORS[key], {
                // oxlint-disable-next-line typescript/no-unnecessary-condition
                "opacity-65": responses && !solutions.includes(key),
              })}
              label={ANSWERS_LABELS[key]}
              labelClassName={ANSWER_BADGE_COLORS[key]}
              correct={solutions.includes(key)}
            >
              {answer}
            </AnswerButton>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Responses
