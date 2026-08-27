import type { QuestionMedia as QuestionMediaType } from "@razzia/common/types/game"
import { QUESTION_CONTENT_ENTER_MS } from "@razzia/common/utils/question-transition"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import clsx from "clsx"
import { motion, useReducedMotion } from "motion/react"

const QUESTION_LAYOUT_ID = "game-question"

const CALM_EASE = [0.16, 1, 0.3, 1] as const

export const QUESTION_LAYOUT_MODE = "position" as const

export const QUESTION_LAYOUT_TRANSITION_MS = QUESTION_CONTENT_ENTER_MS

const CARD_GEOMETRY = "max-w-4xl px-6 py-8 md:px-10 md:py-10"

interface Props {
  question: string
  media?: QuestionMediaType
  className?: string
  reveal?: boolean
}

/**
 * Stable question geometry shared by the prompt and answering screens, so the
 * text can translate between them without reflowing first.
 */
const QuestionCard = ({
  question,
  media,
  className,
  reveal = false,
}: Props) => {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      layout={QUESTION_LAYOUT_MODE}
      layoutId={QUESTION_LAYOUT_ID}
      initial={reveal && !reducedMotion ? { opacity: 0 } : false}
      animate={reveal ? { opacity: 1 } : undefined}
      transition={{
        layout: {
          duration: reducedMotion ? 0 : QUESTION_LAYOUT_TRANSITION_MS / 1_000,
          ease: CALM_EASE,
        },
        ...(reveal && {
          opacity: {
            duration: reducedMotion ? 0 : QUESTION_CONTENT_ENTER_MS / 1_000,
            ease: CALM_EASE,
          },
        }),
      }}
      data-question-layout={QUESTION_LAYOUT_ID}
      data-question-entrance={reveal ? "fade" : undefined}
      className={clsx("w-full", CARD_GEOMETRY, className)}
    >
      <h2 className="text-text-primary text-center text-2xl font-bold text-balance md:text-4xl lg:text-5xl">
        {question}
      </h2>

      <div className="mt-6 flex justify-center empty:mt-0">
        <QuestionMedia media={media} alt={question} />
      </div>
    </motion.div>
  )
}

export default QuestionCard
