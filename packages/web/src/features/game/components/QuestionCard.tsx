import type { QuestionMedia as QuestionMediaType } from "@razzia/common/types/game"
import {
  QUESTION_CONTENT_ENTER_MS,
  QUESTION_SENTENCE_FADE_MS,
  splitQuestionSentences,
} from "@razzia/common/utils/question-transition"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import clsx from "clsx"
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef } from "react"

const QUESTION_LAYOUT_ID = "game-question"

const CALM_EASE = [0.16, 1, 0.3, 1] as const

export const QUESTION_LAYOUT_MODE = "position" as const

export const QUESTION_LAYOUT_TRANSITION_MS = QUESTION_CONTENT_ENTER_MS

const CARD_GEOMETRY = "px-6 py-8 md:px-10 md:py-10"

interface Props {
  question: string
  media?: QuestionMediaType
  className?: string
  reveal?: boolean
  visibleCount?: number
  shouldLift?: boolean
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
  visibleCount,
  shouldLift = false,
}: Props) => {
  const reducedMotion = useReducedMotion()
  const sentences = splitQuestionSentences(question)
  const shownCount = reveal
    ? (visibleCount ?? sentences.length)
    : sentences.length
  const fadeMs = reveal && !reducedMotion ? QUESTION_SENTENCE_FADE_MS : 0
  const stackRef = useRef<HTMLHeadingElement>(null)
  const firstSentenceRef = useRef<HTMLSpanElement>(null)
  const liftY = useMotionValue(0)

  useLayoutEffect(() => {
    if (!reveal || reducedMotion || !shouldLift) {
      liftY.set(0)
      return
    }

    const fullHeight = stackRef.current?.offsetHeight ?? 0
    const firstHeight = firstSentenceRef.current?.offsetHeight ?? 0
    const offset = Math.max(0, (fullHeight - firstHeight) / 2)
    liftY.set(offset)

    const control = animate(liftY, 0, {
      duration: QUESTION_SENTENCE_FADE_MS / 1_000,
      ease: CALM_EASE,
    })

    return () => {
      control.stop()
    }
  }, [liftY, question, reducedMotion, reveal, shouldLift])

  return (
    <motion.div
      layout={QUESTION_LAYOUT_MODE}
      layoutId={QUESTION_LAYOUT_ID}
      style={{ y: liftY }}
      transition={{
        layout: {
          duration: reducedMotion ? 0 : QUESTION_LAYOUT_TRANSITION_MS / 1_000,
          ease: CALM_EASE,
        },
      }}
      data-question-layout={QUESTION_LAYOUT_ID}
      data-question-entrance={reveal ? "fade" : undefined}
      className={clsx("w-full", CARD_GEOMETRY, className)}
    >
      <h2
        ref={stackRef}
        className="text-text-primary flex w-full flex-col gap-3 text-center text-2xl font-bold md:text-4xl lg:text-5xl"
      >
        {sentences.map((sentence, index) => {
          const visible = index < shownCount

          return (
            <motion.span
              key={index}
              ref={index === 0 ? firstSentenceRef : undefined}
              data-question-sentence=""
              data-question-sentence-state={visible ? "visible" : "reserved"}
              className="block w-full text-center text-balance"
              initial={reveal && !reducedMotion ? { opacity: 0 } : false}
              animate={{ opacity: visible ? 1 : 0 }}
              transition={{
                duration: fadeMs / 1_000,
                ease: "linear",
              }}
            >
              {sentence}
            </motion.span>
          )
        })}
      </h2>

      <motion.div
        className="mt-6 flex justify-center empty:mt-0"
        initial={reveal && !reducedMotion ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{
          duration: fadeMs / 1_000,
          ease: "linear",
        }}
      >
        <QuestionMedia media={media} alt={question} />
      </motion.div>
    </motion.div>
  )
}

export default QuestionCard
