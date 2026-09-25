import type { Question, QuizzWithId } from "@razzia/common/types/game"
import type { BackgroundRef } from "@razzia/common/types/visuals"
import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react"
import { v7 as uuid } from "uuid"

export type QuestionWithId = Question & {
  id: string
}

interface QuizzEditorContextType {
  quizzId: string | null
  subject: string
  setSubject: (_subject: string) => void
  questions: QuestionWithId[]
  currentIndex: number
  currentQuestion: QuestionWithId
  setCurrentIndex: (_index: number) => void
  addQuestion: () => void
  removeQuestion: (_index: number) => void
  reorderQuestions: (_from: number, _to: number) => void
  updateQuestion: (_index: number, _updates: Partial<QuestionWithId>) => void
  background: BackgroundRef | undefined
  backgroundUrl: string | undefined
  /** True once the saveable quiz differs from what the editor opened with. */
  isDirty: boolean
  setBackground: (
    _ref: BackgroundRef | undefined,
    _url: string | undefined,
  ) => void
}

const QuizzEditorContext = createContext<QuizzEditorContextType | null>(null)

const defaultQuestion = (): QuestionWithId => ({
  id: uuid(),
  question: "",
  answers: ["", ""],
  solutions: [0],
  cooldown: 5,
  time: 20,
})

const toQuestionWithId = (q: Question): QuestionWithId => ({
  ...q,
  id: uuid(),
})

// What Save sends, minus the editor-only question ids, so reordering back or
// retyping the original text reads as clean again.
const snapshot = (
  subject: string,
  questions: QuestionWithId[],
  background: BackgroundRef | undefined,
) =>
  JSON.stringify({
    subject,
    questions: questions.map((question) => ({ ...question, id: undefined })),
    background: background ?? null,
  })

const boundQuestionIndex = (index: number, length: number) =>
  Math.min(Math.max(0, index), Math.max(0, length - 1))

type QuizzEditorProviderProps = PropsWithChildren<{
  initialData?: QuizzWithId
  initialBackgroundUrl?: string
}>

export const QuizzEditorProvider = ({
  children,
  initialData,
  initialBackgroundUrl,
}: QuizzEditorProviderProps) => {
  const [subject, setSubject] = useState(
    initialData?.subject ?? "Untitled Quizz",
  )
  const [questions, setQuestions] = useState<QuestionWithId[]>(
    initialData?.questions.length
      ? initialData.questions.map(toQuestionWithId)
      : [defaultQuestion()],
  )
  const [currentIndex, setCurrentIndexState] = useState(0)
  const [background, setBackgroundRef] = useState<BackgroundRef | undefined>(
    initialData?.visuals?.background,
  )
  const [backgroundUrl, setBackgroundUrl] = useState<string | undefined>(
    initialBackgroundUrl,
  )
  const [initialSnapshot] = useState(() =>
    snapshot(subject, questions, background),
  )
  const isDirty = snapshot(subject, questions, background) !== initialSnapshot
  const activeIndex = boundQuestionIndex(currentIndex, questions.length)
  const currentQuestion = questions[activeIndex]

  if (activeIndex !== currentIndex) {
    setCurrentIndexState(activeIndex)
  }

  const setBackground = (
    ref: BackgroundRef | undefined,
    url: string | undefined,
  ) => {
    setBackgroundRef(ref)
    setBackgroundUrl(url)
  }

  const setCurrentIndex = (index: number) => {
    setCurrentIndexState(boundQuestionIndex(index, questions.length))
  }

  const addQuestion = () => {
    setQuestions((prev) => [...prev, defaultQuestion()])
    setCurrentIndexState(questions.length)
  }

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) {
      return
    }

    const next = questions.filter((_, i) => i !== index)
    setQuestions(next)
    setCurrentIndexState(
      boundQuestionIndex(
        currentIndex >= index ? currentIndex - 1 : currentIndex,
        next.length,
      ),
    )
  }

  const reorderQuestions = (from: number, to: number) => {
    setQuestions((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)

      return next
    })
    setCurrentIndex(to)
  }

  const updateQuestion = (index: number, updates: Partial<QuestionWithId>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...updates } : q)),
    )
  }

  return (
    <QuizzEditorContext.Provider
      value={{
        quizzId: initialData?.id ?? null,
        subject,
        setSubject,
        questions,
        currentIndex: activeIndex,
        currentQuestion,
        setCurrentIndex,
        addQuestion,
        removeQuestion,
        reorderQuestions,
        updateQuestion,
        background,
        backgroundUrl,
        setBackground,
        isDirty,
      }}
    >
      {children}
    </QuizzEditorContext.Provider>
  )
}

export const useQuizzEditor = () => {
  const ctx = useContext(QuizzEditorContext)

  if (!ctx) {
    throw new Error("useQuizzEditor must be used inside QuizzEditorProvider")
  }

  return ctx
}
