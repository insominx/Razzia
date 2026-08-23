import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import QuestionCard from "@razzia/web/features/game/components/QuestionCard"
import { useSfx } from "@razzia/web/features/game/hooks/use-sfx"
import {
  ANSWER_BAR,
  ANSWER_IDENTITY,
  ANSWER_INK,
  ANSWERS_LABELS,
  SFX,
} from "@razzia/web/features/game/utils/constants"
import { calculatePercentages } from "@razzia/web/features/game/utils/score"
import clsx from "clsx"
import { useEffect } from "react"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_RESPONSES"]
}

const Responses = ({
  data: { question, answers, media, responses, solutions },
}: Props) => {
  const sfx = useSfx()
  const percentages = calculatePercentages(responses)

  const [sfxResults] = useSound(sfx(SFX.RESULTS_SOUND), {
    volume: 0.2,
  })

  const [playMusic, { stop: stopMusic }] = useSound(sfx(SFX.ANSWERS.MUSIC), {
    volume: 0.2,
    interrupt: true,
    loop: true,
  })

  // `use-sound` hands back a no-op until Howler has loaded the file, so the
  // callback identity is the ready signal, not a dependency to chase.
  useEffect(() => {
    sfxResults()
  }, [sfxResults])

  // Mount-owned bed, same as `Answers`: start it once the Howl is ready and
  // stop it in cleanup so the loop cannot outlive the reveal screen.
  useEffect(() => {
    playMusic()

    return () => {
      stopMusic()
    }
    // oxlint-disable-next-line
  }, [playMusic])

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5">
        <QuestionCard question={question} media={media} />

        <div className="mt-8 flex w-full max-w-3xl flex-col gap-3 px-2 md:gap-4">
          {answers.map((_, key) => {
            const count = responses[key] || 0
            // A slot nobody picked has no share at all, and an unset width
            // fills the track instead of emptying it.
            const width = percentages[key] ?? "0%"

            return (
              <div
                key={key}
                className={clsx("flex items-center gap-3 md:gap-4", {
                  "opacity-80": !solutions.includes(key),
                })}
              >
                <span
                  className={clsx(
                    "w-6 shrink-0 font-mono text-xl font-bold md:w-8 md:text-2xl",
                    ANSWER_INK[key],
                  )}
                >
                  {ANSWERS_LABELS[key]}
                </span>

                <div className="bg-border h-3 flex-1 overflow-hidden rounded-full md:h-4">
                  <div
                    data-bar
                    className={clsx(
                      "animate-rz-bar-grow h-full origin-left rounded-full",
                      ANSWER_BAR[key],
                    )}
                    style={{ width }}
                  />
                </div>

                <span
                  className={clsx(
                    "w-14 shrink-0 text-right font-mono font-bold tabular-nums md:w-20 md:text-xl",
                    count ? ANSWER_INK[key] : "text-text-primary",
                  )}
                >
                  {width}
                </span>

                <span
                  className={clsx(
                    "w-8 shrink-0 text-right font-mono font-bold tabular-nums md:w-12 md:text-xl",
                    ANSWER_INK[key],
                  )}
                >
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-1 gap-3 px-4 text-lg font-bold sm:grid-cols-2 md:gap-4 md:text-xl">
          {answers.map((answer, key) => (
            <AnswerButton
              key={key}
              className={clsx(ANSWER_IDENTITY[key], {
                // oxlint-disable-next-line typescript/no-unnecessary-condition
                "opacity-80": responses && !solutions.includes(key),
              })}
              label={ANSWERS_LABELS[key]}
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
