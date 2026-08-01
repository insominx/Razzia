import QuestionEditor from "@razzia/web/features/quizz/components/QuestionEditor"
import QuizzEditorHeader from "@razzia/web/features/quizz/components/QuizzEditorHeader"
import QuizzEditorSidebar from "@razzia/web/features/quizz/components/QuizzEditorSidebar"
import { QuizzEditorProvider } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { createFileRoute } from "@tanstack/react-router"

const QuizzEditorPage = () => {
  const globalBackgroundUrl = useManagerStore(
    (state) => state.config?.game.resolvedVisuals.backgroundUrl,
  )

  return (
    <QuizzEditorProvider initialBackgroundUrl={globalBackgroundUrl}>
      <div className="bg-canvas text-text-body relative flex h-svh flex-col">
        <QuizzEditorHeader />
        <div className="flex flex-1 overflow-hidden">
          <QuizzEditorSidebar />
          <QuestionEditor />
        </div>
      </div>
    </QuizzEditorProvider>
  )
}

export const Route = createFileRoute("/manager/quizz/")({
  component: QuizzEditorPage,
})
