import {
  ANSWER_IDENTITY,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { Check, Minus, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

const QuestionEditorAnswers = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const updateAnswer = (index: number, value: string) => {
    const next = [...currentQuestion.answers]
    next[index] = value
    updateQuestion(currentIndex, { answers: next })
  }

  const addAnswer = () => {
    if (currentQuestion.answers.length >= 4) {
      return
    }

    updateQuestion(currentIndex, { answers: [...currentQuestion.answers, ""] })
  }

  const removeAnswer = () => {
    if (currentQuestion.answers.length <= 2) {
      return
    }

    const next = currentQuestion.answers.slice(0, -1)
    const maxIndex = next.length - 1
    const nextSolution = currentQuestion.solutions.filter((s) => s <= maxIndex)

    updateQuestion(currentIndex, {
      answers: next,
      solutions: nextSolution.length > 0 ? nextSolution : [0],
    })
  }

  const toggleSolution = (index: number) => {
    const current = currentQuestion.solutions

    if (current.includes(index)) {
      const next = current.filter((s) => s !== index)
      updateQuestion(currentIndex, {
        solutions: next.length > 0 ? next : [index],
      })
    } else {
      updateQuestion(currentIndex, { solutions: [...current, index] })
    }
  }

  return (
    <div className="z-10 flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="bg-surface border-border text-text-muted rounded-rz-md border px-2 py-1 text-sm font-semibold">
          {currentQuestion.answers.length}
          {t("quizz:answersCountSuffix")}
        </div>
        <div className="flex gap-2">
          <button
            onClick={removeAnswer}
            disabled={currentQuestion.answers.length <= 2}
            className="bg-panel border-border text-text-body hover:bg-brand-tint rounded-rz-md flex size-7 items-center justify-center border transition-colors ease-calm disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <button
            onClick={addAnswer}
            disabled={currentQuestion.answers.length >= 4}
            className="bg-panel border-border text-text-body hover:bg-brand-tint rounded-rz-md flex size-7 items-center justify-center border transition-colors ease-calm disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {currentQuestion.answers.map((answer, i) => {
          const isSelected = currentQuestion.solutions.includes(i)

          return (
            <div
              key={i}
              className={clsx(
                "flex items-center gap-3 rounded-rz-xl border-2 px-4 py-6",
                ANSWER_IDENTITY[i],
              )}
            >
              <span className="font-mono flex size-8 shrink-0 items-center justify-center rounded-rz-sm border-2 border-current bg-canvas/25 text-base font-bold md:size-10 md:text-lg">
                {ANSWERS_LABELS[i]}
              </span>
              <div className="flex flex-1 items-center justify-between gap-1.5">
                <input
                  className="text-text-primary placeholder:text-text-muted w-full bg-transparent font-semibold outline-none"
                  placeholder={t("quizz:addAnswerPlaceholder")}
                  value={answer}
                  onChange={(e) => updateAnswer(i, e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => toggleSolution(i)}
                  className={clsx(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ease-calm",
                    isSelected
                      ? "border-success-border bg-success-tint text-success"
                      : "border-border bg-transparent text-text-muted",
                  )}
                >
                  {isSelected && <Check className="size-4 stroke-5" />}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default QuestionEditorAnswers
