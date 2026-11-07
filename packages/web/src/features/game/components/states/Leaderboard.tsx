import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import Fire from "@razzia/web/features/game/components/icons/Fire"
import Odometer from "@razzia/web/features/game/components/Odometer"
import {
  BOARD_COMMENT_DELAY_MS,
  BOARD_HOLD_MS,
  BOARD_RACE_MS,
  BOARD_REORDER_MS,
  BOARD_SWAP_MS,
  barShare,
  boardCommentary,
  placeChange,
} from "@razzia/web/features/game/utils/board"
import { MEDAL } from "@razzia/web/features/game/utils/game-constants"
import clsx from "clsx"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

const CALM_EASE = [0.16, 1, 0.3, 1] as const

interface Props {
  data: ManagerStatusDataMap["SHOW_LEADERBOARD"]
}

type Beat = "hold" | "race" | "swapped" | "told"

const StreakBadge = ({ streak }: { streak: number }) => (
  <AnimatePresence>
    {streak >= 2 && (
      <motion.div
        key="streak"
        initial={{ opacity: 0, scale: 0.5, x: -10 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.5, x: -10 }}
        transition={{ duration: 0.5, ease: CALM_EASE }}
        className="bg-warning-tint border-warning-border text-warning ml-2 flex shrink-0 items-center gap-1 rounded-full border p-1"
      >
        <Fire className="size-7" />
      </motion.div>
    )}
  </AnimatePresence>
)

const RankBadge = ({ rank }: { rank: number }) => (
  <span
    data-rank-badge={rank}
    className={clsx(
      "rounded-rz-md flex size-16 shrink-0 items-center justify-center border-2 font-mono text-4xl font-bold tabular-nums",
      rank <= MEDAL.length
        ? MEDAL[rank - 1]
        : "border-border bg-surface text-text-muted",
    )}
  >
    {rank}
  </span>
)

/** ▲2 or ▼1: the places a player moved since the last board. */
const PlaceChange = ({ change }: { change: number }) => (
  <motion.span
    data-place-change={change > 0 ? "up" : "down"}
    initial={{ opacity: 0, scale: 0.6 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.4, ease: CALM_EASE }}
    className={clsx(
      "shrink-0 rounded-full border px-3 font-mono text-2xl font-bold tabular-nums",
      change > 0
        ? "bg-success-tint border-success-border text-success"
        : "bg-danger-tint border-danger-border text-danger",
    )}
  >
    {change > 0 ? "▲" : "▼"}
    {Math.abs(change)}
  </motion.span>
)

/**
 * The board after a question as a bar race: a bar's length is a player's score.
 * It holds the old standing, the bars grow and the points roll to the new
 * scores, then the rows swap into their new order, who moved is marked, and one
 * line says the most interesting thing about it.
 */
const Leaderboard = ({ data: { oldLeaderboard, leaderboard } }: Props) => {
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false
  const [beat, setBeat] = useState<Beat>(reduced ? "told" : "hold")

  useEffect(() => {
    if (reduced) {
      setBeat("told")

      return
    }

    setBeat("hold")

    const timers = [
      setTimeout(() => setBeat("race"), BOARD_HOLD_MS),
      setTimeout(() => setBeat("swapped"), BOARD_REORDER_MS),
      setTimeout(
        () => setBeat("told"),
        BOARD_REORDER_MS + BOARD_COMMENT_DELAY_MS,
      ),
    ]

    return () => {
      timers.forEach(clearTimeout)
    }
  }, [oldLeaderboard, leaderboard, reduced])

  const racing = beat !== "hold"
  const swapped = beat === "swapped" || beat === "told"
  const rows = swapped ? leaderboard : oldLeaderboard
  const longest = Math.max(1, ...leaderboard.map((player) => player.points))
  const commentary = boardCommentary(oldLeaderboard, leaderboard)

  return (
    <section className="relative mx-auto flex w-full max-w-[96rem] flex-1 flex-col items-center justify-center px-2">
      <h2 className="text-text-primary stage:text-6xl mb-8 text-5xl font-bold">
        {t("game:leaderboard")}
      </h2>

      <div className="flex w-full flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {rows.map(({ id, username, points, streak }, index) => {
            const previous = oldLeaderboard.find((p) => p.id === id)
            const current = leaderboard.find((p) => p.id === id)
            // Only the old top five travel with the payload, so a player who
            // climbed in from further down has no known previous score.
            const gained =
              previous && current ? current.points - previous.points : 0
            const shown = racing ? (current?.points ?? points) : points
            const change = swapped
              ? placeChange(oldLeaderboard, leaderboard, id)
              : 0

            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40, transition: { duration: 0.2 } }}
                transition={{
                  layout: { duration: BOARD_SWAP_MS / 1_000, ease: CALM_EASE },
                }}
                data-leaderboard-row
                className="bg-panel border-border text-text-primary rounded-rz-lg stage:text-[2.75rem] flex w-full items-center gap-5 border p-3 text-4xl font-bold"
              >
                <RankBadge rank={index + 1} />

                <span className="flex w-[22%] min-w-0 shrink-0 items-center gap-2">
                  <span className="truncate">{username}</span>
                  <StreakBadge streak={streak} />
                </span>

                <span
                  data-board-track
                  className="bg-surface relative h-12 min-w-0 flex-1 overflow-hidden rounded-full"
                >
                  <span
                    data-board-bar
                    className="rz-board-bar bg-brand absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${barShare(shown, longest) * 100}%`,
                      transitionDuration: `${BOARD_RACE_MS}ms`,
                    }}
                  />
                </span>

                <span className="flex min-w-[15rem] shrink-0 items-center justify-end gap-3 font-mono">
                  <AnimatePresence>
                    {swapped && gained > 0 && (
                      <motion.span
                        key="gained"
                        data-points-gained
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, ease: CALM_EASE }}
                        className="bg-success-tint border-success-border text-success shrink-0 rounded-full border px-3 py-0.5 text-2xl"
                      >
                        +{gained}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {change !== 0 && <PlaceChange change={change} />}
                </span>

                <Odometer
                  value={shown}
                  roll={!reduced}
                  durationMs={BOARD_RACE_MS - 400}
                  className="min-w-[7ch] shrink-0 justify-end font-mono"
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <div className="mt-8 h-16">
        <AnimatePresence>
          {beat === "told" && commentary && (
            <motion.p
              key={commentary.key}
              data-board-commentary
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: CALM_EASE }}
              className="text-text-body text-center text-4xl font-semibold"
            >
              {t(commentary.key, commentary.values)}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

export default Leaderboard
