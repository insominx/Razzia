import type { GameResult, QuestionResult } from "@razzia/common/types/game"
import {
  buildPointsByName,
  computeQuestionStats,
  type QuestionStats,
} from "@razzia/web/features/manager/contexts/result-stats"
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react"

interface ResultModalContextType extends QuestionStats {
  result: GameResult
  // Null for a result that holds no questions.
  questionResult: QuestionResult | null
  questionIndex: number
  total: number
  // Null when the player is not in the final standings.
  getPlayerPoints: (_name: string) => number | null
  goNext: () => void
  goPrev: () => void
  onClose: () => void
}

const ResultModalContext = createContext<ResultModalContextType | null>(null)

type Props = PropsWithChildren<{
  result: GameResult
  onClose: () => void
}>

export const ResultModalProvider = ({ children, result, onClose }: Props) => {
  const [requestedIndex, setQuestionIndex] = useState(0)

  const total = result.questions.length
  const questionIndex = Math.max(0, Math.min(requestedIndex, total - 1))
  const questionResult: QuestionResult | null =
    result.questions.at(questionIndex) ?? null

  const stats = useMemo(
    () =>
      computeQuestionStats(
        questionResult ?? { answers: [], solutions: [], playerAnswers: [] },
      ),
    [questionResult],
  )
  const pointsByName = useMemo(
    () => buildPointsByName(result.players),
    [result.players],
  )

  const getPlayerPoints = (name: string) => pointsByName.get(name) ?? null

  const goNext = () => setQuestionIndex((i) => Math.min(i + 1, total - 1))

  const goPrev = () => setQuestionIndex((i) => Math.max(i - 1, 0))

  return (
    <ResultModalContext.Provider
      value={{
        ...stats,
        result,
        questionResult,
        questionIndex,
        total,
        getPlayerPoints,
        goNext,
        goPrev,
        onClose,
      }}
    >
      {children}
    </ResultModalContext.Provider>
  )
}

export const useResultModal = () => {
  const ctx = useContext(ResultModalContext)

  if (!ctx) {
    throw new Error("useResultModal must be used inside ResultModalProvider")
  }

  return ctx
}
