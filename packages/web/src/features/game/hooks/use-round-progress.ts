import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"

export interface RoundProgress {
  /** The quiz's length, if known. */
  total: number | undefined
  /**
   * 1-based numbers of the questions already played, this one aside. Unset when
   * the questions play in order: then they are simply the lower numbers.
   */
  done: number[] | undefined
  /** This is the last question the game will play. */
  final: boolean
}

/**
 * Where a question sits in the game. A quiz plays its questions in order, so
 * that is its number; a lecture deck plays them by slide, in any order and not
 * always all of them, so it is the questions the deck has really played.
 *
 * The host reads a lecture's progress from `lecture` in the manager store; a
 * phone from the questions played that came with the question's update.
 */
export const useRoundProgress = (questionNumber: number): RoundProgress => {
  const total = useQuestionStore((state) => state.questionStates?.total)
  const sentPlayed = useQuestionStore((state) => state.questionStates?.played)
  const lecture = useManagerStore((state) => state.lecture)
  const played = lecture?.played ?? sentPlayed

  if (!played) {
    return { total, done: undefined, final: questionNumber === total }
  }

  // The card can arrive before the deck's own update, which would add this
  // question; leaving it out either way, the others decide.
  const done = played
    .map((index) => index + 1)
    .filter((number) => number !== questionNumber)

  return {
    total,
    done,
    final: total !== undefined && done.length === total - 1,
  }
}
