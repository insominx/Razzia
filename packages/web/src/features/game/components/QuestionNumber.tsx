import {
  QUESTION_CONTENT_ENTER_MS,
  QUESTION_NUMBER_FADE_MS,
} from "@razzia/common/utils/question-transition"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import clsx from "clsx"
import { motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"

const QUESTION_NUMBER_LAYOUT_ID = "game-question-number"
const CALM_EASE = [0.16, 1, 0.3, 1] as const

interface Props {
  questionNumber: number
  intro?: boolean
  className?: string
}

const QuestionNumber = ({
  questionNumber,
  intro = false,
  className,
}: Props) => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const total = useQuestionStore((state) => state.questionStates?.total)
  // "Question 4 of 6", and "Final question" on the last; a quiz of one, or one
  // whose length is not known, keeps the plain number.
  const known = total !== undefined && total > 1
  const label = (() => {
    if (!known) {
      return `${t("game:questionPrefix")}${questionNumber}`
    }

    return questionNumber === total
      ? t("game:finalQuestion")
      : t("game:questionOf", { number: questionNumber, total })
  })()

  return (
    <motion.p
      layout="position"
      layoutId={QUESTION_NUMBER_LAYOUT_ID}
      initial={intro && !reducedMotion ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{
        opacity: {
          duration: reducedMotion ? 0 : QUESTION_NUMBER_FADE_MS / 1_000,
          ease: CALM_EASE,
        },
        layout: {
          duration: reducedMotion ? 0 : QUESTION_CONTENT_ENTER_MS / 1_000,
          ease: CALM_EASE,
        },
      }}
      data-question-number-layout={QUESTION_NUMBER_LAYOUT_ID}
      data-question-number-phase={intro ? "intro" : "settled"}
      className={clsx(
        "text-text-muted stage:text-[1.75rem] text-center text-xl leading-none font-bold tracking-[0.12em] uppercase",
        className,
      )}
    >
      {label}
    </motion.p>
  )
}

export default QuestionNumber
