import type { PlayerStatusDataMap } from "@razzia/common/types/game/status"
import Loader from "@razzia/web/components/Loader"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import {
  ANSWER_IDENTITY,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { useTranslation } from "react-i18next"

interface Props {
  data: PlayerStatusDataMap["WAIT"]
}

const WAITING_FOR_ANSWERS = "game:waitingForAnswers"

const Wait = ({ data: { text } }: Props) => {
  const { t } = useTranslation()
  const lastAnswer = usePlayerStore((state) => state.lastAnswer)
  const currentQuestion = useQuestionStore(
    (state) => state.questionStates?.current,
  )
  // Only echo a pick made for the question on screen; a reload or a stale
  // store falls back to the plain waiting state.
  const picked =
    text === WAITING_FOR_ANSWERS &&
    lastAnswer?.questionNumber === currentQuestion
      ? lastAnswer
      : null

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4">
      {picked ? (
        <div
          data-picked-answer
          className="animate-rz-enter flex w-full max-w-md flex-col items-center gap-3"
        >
          <p className="text-text-muted text-sm font-bold tracking-[0.18em] uppercase">
            {t("game:yourAnswer")}
          </p>
          <div
            className={clsx(
              "rounded-rz-lg flex w-full items-center gap-3 border-2 px-4 py-5",
              ANSWER_IDENTITY[picked.key],
            )}
          >
            <span className="rounded-rz-sm bg-canvas/25 flex size-10 shrink-0 items-center justify-center border-2 border-current font-mono text-lg font-bold">
              {ANSWERS_LABELS[picked.key]}
            </span>
            <p className="text-text-primary min-w-0 flex-1 text-lg font-bold wrap-break-word">
              {picked.text}
            </p>
          </div>
          <Loader className="mt-4 h-12" />
        </div>
      ) : (
        <Loader className="h-30" />
      )}
      <h2 className="text-text-primary mt-5 text-center text-3xl font-bold md:text-4xl lg:text-5xl">
        {t(text)}
      </h2>
    </section>
  )
}

export default Wait
