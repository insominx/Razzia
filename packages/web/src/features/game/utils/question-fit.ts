import {
  PROMPT_BUDGET_REM,
  PROMPT_TIERS,
  promptHeightRem,
} from "@razzia/web/features/game/utils/type-tier"

/**
 * The longest answer a tile holds at the smallest size the room can read
 * (2.6875 rem, three lines in a 13.5 rem tile). The longest answer in the
 * lecture decks is 80 characters and fits with room to spare.
 */
export const ANSWER_FIT_CHARS = 90

/**
 * The type-size estimate is cautious: the tallest real prompt (a 294-character
 * question with a listing) comes out about 1% over the budget at the smallest
 * size and still measures as fitting. A warning means clearly over, not borderline.
 */
const PROMPT_SLACK = 1.1

export type FitProblem = "prompt" | "answer"

/**
 * What in a question the projector may not be able to show. This is an estimate
 * from the text alone, made the same way the stage picks its type size; the
 * Director's fit report measures the real layout, and is the judge. A question
 * this says nothing about is one the stage can lay out at some size; one it
 * flags is worth a look before class.
 */
export const questionFitProblems = (question: {
  question: string
  answers: readonly string[]
}): FitProblem[] => {
  const problems: FitProblem[] = []
  const smallest = PROMPT_TIERS[PROMPT_TIERS.length - 1]

  if (
    promptHeightRem(question.question, smallest) >
    PROMPT_BUDGET_REM * PROMPT_SLACK
  ) {
    problems.push("prompt")
  }

  if (question.answers.some((answer) => answer.length > ANSWER_FIT_CHARS)) {
    problems.push("answer")
  }

  return problems
}
