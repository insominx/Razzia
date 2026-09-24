import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import CricleCheck from "@razzia/web/features/game/components/icons/CricleCheck"
import CricleXmark from "@razzia/web/features/game/components/icons/CricleXmark"
import { useSfx } from "@razzia/web/features/game/hooks/use-sfx"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { SFX, sfxVolume } from "@razzia/web/features/game/utils/constants"
import { HAPTIC, haptic } from "@razzia/web/features/game/utils/haptics"
import { formatRank } from "@razzia/web/features/game/utils/rank"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_RESULT"]
}

const Result = ({
  data: { correct, message, points, myPoints, rank, aheadOfMe },
}: Props) => {
  const player = usePlayerStore()
  const { t } = useTranslation()

  const sfx = useSfx()

  const resultsSrc = sfx(SFX.RESULTS_SOUND)
  const [sfxResults] = useSound(resultsSrc, { volume: sfxVolume(resultsSrc) })

  useEffect(() => {
    haptic(correct ? HAPTIC.correct : HAPTIC.wrong)
  }, [correct])

  useEffect(() => {
    player.updatePoints(myPoints)

    sfxResults()
    // oxlint-disable-next-line
  }, [sfxResults])

  return (
    <section className="anim-show relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      {correct ? (
        <CricleCheck className="aspect-square max-h-60 w-full" />
      ) : (
        <CricleXmark className="aspect-square max-h-60 w-full" />
      )}
      <h2 className="text-text-primary mt-1 text-4xl font-bold">
        {t(message)}
      </h2>
      <p className="text-text-primary mt-1 text-xl font-bold">
        {t("game:resultTop")}
        {formatRank(t, rank)}
        {aheadOfMe ? `${t("game:resultBehind")}${aheadOfMe}` : ""}
      </p>
      {correct && (
        <span className="bg-success-tint border-success-border text-success rounded-rz-md mt-2 border px-4 py-2 text-2xl font-bold">
          +{points}
        </span>
      )}
    </section>
  )
}

export default Result
