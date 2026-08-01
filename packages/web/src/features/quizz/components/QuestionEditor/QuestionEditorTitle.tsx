import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import type { ChangeEvent } from "react"
import { useTranslation } from "react-i18next"

const QuestionEditorTitle = () => {
  const { updateQuestion, currentIndex, currentQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const handleChangeQuestion = (e: ChangeEvent<HTMLInputElement>) => {
    updateQuestion(currentIndex, { question: e.target.value })
  }

  return (
    <div className="bg-surface border-border rounded-rz-lg z-10 border">
      <input
        className="text-text-primary placeholder:text-text-muted w-full resize-none bg-transparent p-4 text-center text-xl font-semibold outline-none"
        placeholder={t("quizz:question.placeholder")}
        value={currentQuestion.question}
        onChange={handleChangeQuestion}
      />
    </div>
  )
}

export default QuestionEditorTitle
