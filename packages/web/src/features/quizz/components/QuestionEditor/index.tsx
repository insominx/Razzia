import Atmosphere from "@razzia/web/components/Atmosphere"
import QuestionEditorAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"

const QuestionEditor = () => {
  const { backgroundUrl } = useQuizzEditor()

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="mx-auto flex max-w-7xl flex-1 flex-col gap-4 overflow-y-auto p-6">
        <QuestionEditorTitle />
        <QuestionEditorMedia />
        <QuestionEditorAnswers />

        <Atmosphere recipe="photo" backgroundUrl={backgroundUrl} />
      </main>
      <QuestionEditorConfig />
    </div>
  )
}

export default QuestionEditor
