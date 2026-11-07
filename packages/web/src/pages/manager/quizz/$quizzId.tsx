import { EVENTS } from "@razzia/common/constants"
import type { QuizzWithId } from "@razzia/common/types/game"
import Loader from "@razzia/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import QuestionEditor from "@razzia/web/features/quizz/components/QuestionEditor"
import QuizzEditorHeader from "@razzia/web/features/quizz/components/QuizzEditorHeader"
import QuizzEditorSidebar from "@razzia/web/features/quizz/components/QuizzEditorSidebar"
import { QuizzEditorProvider } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const QuizzEditPage = () => {
  const { quizzId } = Route.useParams()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [quizz, setQuizz] = useState<QuizzWithId | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | undefined>(
    undefined,
  )

  useEffect(() => {
    socket.emit(EVENTS.QUIZZ.GET, quizzId)
  }, [socket, quizzId])

  useEvent(EVENTS.QUIZZ.DATA, ({ quizz: data, resolvedVisuals }) => {
    if (data.id === quizzId) {
      setQuizz(data)
      setBackgroundUrl(resolvedVisuals.backgroundUrl)
    }
  })

  // A quiz that is not there (a stale link, one deleted since) would leave the
  // loader spinning. Once a quiz is open, its header answers a failed save.
  // Replace, not push: Back must not return to the missing quiz.
  useEvent(EVENTS.QUIZZ.ERROR, (message) => {
    if (quizz) {
      return
    }

    toast.error(t(message))
    navigate({ to: "/manager/config", replace: true })
  })

  if (!quizz) {
    return (
      <div className="bg-canvas flex h-svh items-center justify-center">
        <Loader className="text-brand max-h-23" />
      </div>
    )
  }

  return (
    <QuizzEditorProvider
      initialData={quizz}
      initialBackgroundUrl={backgroundUrl}
    >
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

export const Route = createFileRoute("/manager/quizz/$quizzId")({
  component: QuizzEditPage,
})
