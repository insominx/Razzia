import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { useCalmVisuals } from "@razzia/web/features/game/hooks/use-show-intensity"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { MEDAL } from "@razzia/web/features/game/utils/constants"
import { formatRank } from "@razzia/web/features/game/utils/rank"
import clsx from "clsx"
import { useEffect, useState } from "react"
import ReactConfetti from "react-confetti"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["FINISHED"]
}

const CONFETTI_COLORS = [
  "#ffb020",
  "#4aaeff",
  "#ff82b9",
  "#d7dce6",
  "#46d5c0",
  "#f5c542",
]

/** Confetti bursts for six seconds and stops: a celebration, not a screensaver. */
const CONFETTI_MS = 6_000

/**
 * A player's own ending: where they finished, with a medal for the top three
 * and a burst of confetti that stops. Everyone gets an ending of their own, not
 * only the three on the projector's podium.
 */
const PlayerFinished = ({ data: { rank, subject, total, points } }: Props) => {
  const { player } = usePlayerStore()
  const { t } = useTranslation()
  const calm = useCalmVisuals()
  const podium = typeof rank === "number" && rank <= 3
  const [bursting, setBursting] = useState(podium && !calm)
  const finalPoints = points ?? player?.points ?? 0

  useEffect(() => {
    if (!bursting) {
      return
    }

    const timeout = setTimeout(() => setBursting(false), CONFETTI_MS)

    return () => {
      clearTimeout(timeout)
    }
  }, [bursting])

  return (
    <section className="animate-rz-fade-in relative flex h-full flex-1 flex-col items-center justify-center gap-5 px-4 text-center">
      {bursting && (
        <ReactConfetti
          recycle={false}
          numberOfPieces={220}
          colors={CONFETTI_COLORS}
          style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
        />
      )}

      <p className="text-text-muted text-xl font-semibold">{subject}</p>

      <div
        data-finish-medal={podium ? rank : undefined}
        className={clsx(
          "grid size-40 place-items-center rounded-full border-4 text-7xl font-extrabold",
          podium
            ? MEDAL[rank - 1]
            : "border-border bg-surface text-text-primary",
        )}
      >
        {typeof rank === "number" ? rank : "–"}
      </div>

      {typeof rank === "number" && (
        <p className="text-text-primary text-4xl font-bold">
          {podium ? t(`game:medal.${rank}`) : formatRank(t, rank)}
        </p>
      )}

      {typeof rank === "number" && (
        <p
          data-finish-summary
          className="text-text-body text-xl font-semibold tabular-nums"
        >
          {t("game:finishedSummary", {
            points: finalPoints.toLocaleString("en-US"),
            rank,
            total: total ?? rank,
          })}
        </p>
      )}
    </section>
  )
}

export default PlayerFinished
