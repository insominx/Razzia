import type { QuestionMedia as QuestionMediaType } from "@razzia/common/types/game"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import clsx from "clsx"

interface Props {
  question: string
  media?: QuestionMediaType
  className?: string
}

/**
 * The framed question panel shared by the answering and reveal screens, so the
 * question does not jump when the timer expires.
 */
const QuestionCard = ({ question, media, className }: Props) => (
  <div
    className={clsx(
      "border-border/60 bg-panel/40 rounded-rz-xl w-full max-w-4xl border px-6 py-8 md:px-10 md:py-10",
      className,
    )}
  >
    <h2 className="text-text-primary text-center text-2xl font-bold text-balance md:text-4xl lg:text-5xl">
      {question}
    </h2>

    <div className="mt-6 flex justify-center empty:mt-0">
      <QuestionMedia media={media} alt={question} />
    </div>
  </div>
)

export default QuestionCard
