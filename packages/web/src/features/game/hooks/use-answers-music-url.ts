import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { answersMusicForTheme } from "@razzia/web/features/game/utils/constants"

export const useAnswersMusicUrl = (): string => {
  const playerGameId = usePlayerStore((s) => s.gameId)
  const playerTheme = usePlayerStore((s) => s.visuals.soundTheme)
  const managerTheme = useManagerStore((s) => s.visuals.soundTheme)

  return answersMusicForTheme(playerGameId ? playerTheme : managerTheme)
}
