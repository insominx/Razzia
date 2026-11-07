import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { formatRank } from "@razzia/web/features/game/utils/rank"
import clsx from "clsx"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["SHOW_STANDING"]
}

const format = (points: number) => points.toLocaleString("en-US")

/**
 * A phone's own place after a question, shown while the room looks at the
 * leaderboard: where you are, whether that moved, who is around you, and what
 * it would take to pass the next player. It reaches every phone, so a student
 * outside the top five is not left guessing.
 */
const Standing = ({
  data: { rank, previousRank, points, gained, ladder, behind },
}: Props) => {
  const { t } = useTranslation()
  const moved = previousRank === null ? 0 : previousRank - rank

  return (
    <section className="animate-rz-fade-in relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4">
      <p
        data-standing-rank
        className="text-text-primary text-center text-6xl font-extrabold"
      >
        {formatRank(t, rank)}
      </p>

      {moved !== 0 && (
        <p
          data-standing-move={moved > 0 ? "up" : "down"}
          className={clsx(
            "text-xl font-bold",
            moved > 0 ? "text-success" : "text-danger",
          )}
        >
          {t(moved > 0 ? "game:standingUp" : "game:standingDown", {
            count: Math.abs(moved),
          })}
        </p>
      )}

      {gained > 0 && (
        <p className="text-success text-lg font-bold tabular-nums">
          +{format(gained)}
        </p>
      )}

      <ol
        className="flex w-full flex-col gap-2"
        aria-label={t("game:leaderboard")}
      >
        {ladder.map((row) => (
          <li
            key={row.rank}
            data-standing-row={row.me ? "me" : "other"}
            className={clsx(
              "rounded-rz-md flex items-center gap-3 px-4 py-3 text-lg font-semibold",
              row.me ? "bg-brand text-on-accent" : "bg-glass text-text-primary",
            )}
          >
            <span className="w-8 font-mono text-xl font-bold tabular-nums">
              {row.rank}
            </span>
            <span className="min-w-0 flex-1 truncate">{row.username}</span>
            <span className="font-mono tabular-nums">{format(row.points)}</span>
          </li>
        ))}
      </ol>

      <p
        data-standing-line
        className="text-text-muted text-center text-base font-semibold"
      >
        {behind
          ? t("game:standingGap", {
              points: format(behind.points),
              name: behind.username,
            })
          : t("game:standingLeader")}
      </p>

      <p className="sr-only">{t("game:pointsShort", { points })}</p>
    </section>
  )
}

export default Standing
