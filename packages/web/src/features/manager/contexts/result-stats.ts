import type {
  GameResultPlayer,
  QuestionResult,
} from "@razzia/common/types/game"

export interface QuestionStats {
  // Everyone recorded for this question. This is the one denominator for the
  // whole viewer, so a late joiner is never counted as "no answer".
  participantCount: number
  answeredCount: number
  noAnswerCount: number
  correctCount: number
  correctPct: number
  // How many picked each answer, in answer order.
  answerCounts: number[]
  maxAnswerCount: number
}

const atLeastZero = (value: number) => Math.max(0, value)

export const computeQuestionStats = (
  question: Pick<QuestionResult, "answers" | "solutions" | "playerAnswers">,
): QuestionStats => {
  const participantCount = question.playerAnswers.length
  const answerCounts = question.answers.map(
    (_, index) =>
      question.playerAnswers.filter((entry) => entry.answerId === index).length,
  )
  const noAnswerCount = question.playerAnswers.filter(
    (entry) => entry.answerId === null,
  ).length
  const answeredCount = atLeastZero(participantCount - noAnswerCount)
  const correctCount = question.playerAnswers.filter(
    (entry) =>
      entry.answerId !== null && question.solutions.includes(entry.answerId),
  ).length
  const correctPct =
    participantCount > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((correctCount / participantCount) * 100)),
        )
      : 0

  return {
    participantCount,
    answeredCount,
    noAnswerCount: atLeastZero(noAnswerCount),
    correctCount: atLeastZero(correctCount),
    correctPct,
    answerCounts,
    maxAnswerCount: Math.max(1, ...answerCounts),
  }
}

// The first player with a name wins, and a name that is not listed has no
// known points, so the table shows a dash instead of a wrong 0.
export const buildPointsByName = (players: readonly GameResultPlayer[]) => {
  const points = new Map<string, number>()

  for (const player of players) {
    if (!points.has(player.username)) {
      points.set(player.username, player.points)
    }
  }

  return points
}
