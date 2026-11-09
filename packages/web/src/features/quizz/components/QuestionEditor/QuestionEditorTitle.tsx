import AutoGrowTextarea from "@razzia/web/components/AutoGrowTextarea"
import { questionFitProblems } from "@razzia/web/features/game/utils/question-fit"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useTranslation } from "react-i18next"

const QuestionEditorTitle = () => {
  const { updateQuestion, currentIndex, currentQuestion } = useQuizzEditor()
  const { t } = useTranslation()
  const problems = questionFitProblems(currentQuestion)

  const handleChangeQuestion = (question: string) => {
    updateQuestion(currentIndex, { question })
  }

  return (
    <div className="bg-surface border-border rounded-rz-lg z-10 border">
      <AutoGrowTextarea
        className="text-text-primary placeholder:text-text-muted block w-full bg-transparent p-4 text-center text-xl font-semibold text-balance outline-none"
        placeholder={t("quizz:question.placeholder")}
        value={currentQuestion.question}
        onValueChange={handleChangeQuestion}
      />
      {problems.map((problem) => (
        <p
          key={problem}
          role="status"
          data-fit-warning={problem}
          className="text-warning border-border border-t px-4 py-2 text-center text-sm font-semibold"
        >
          {t(`quizz:fitWarning.${problem}`)}
        </p>
      ))}
    </div>
  )
}

export default QuestionEditorTitle
