import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["SHOW_PREPARED"]
}

const Prepared = ({ data: { totalAnswers, questionNumber } }: Props) => {
  const { t } = useTranslation()

  return (
    <section className="anim-show relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      <h2 className="anim-show text-text-primary mb-20 text-center text-3xl font-bold md:text-4xl lg:text-5xl">
        {t("game:questionPrefix")}
        {questionNumber}
      </h2>
      <div className="anim-quizz bg-panel border-border rounded-rz-xl grid aspect-square w-60 grid-cols-2 gap-4 border p-5 md:w-60">
        {Array.from({ length: totalAnswers }).map((_, key) => (
          <div
            key={key}
            className={clsx(
              "button rounded-rz-lg flex aspect-square h-full w-full items-center justify-center",
              ANSWERS_COLORS[key],
            )}
          >
            <span className="font-mono text-2xl font-bold md:text-3xl">
              {ANSWERS_LABELS[key]}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default Prepared
