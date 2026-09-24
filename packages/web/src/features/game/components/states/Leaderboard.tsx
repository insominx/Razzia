import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import Fire from "@razzia/web/features/game/components/icons/Fire"
import { MEDAL } from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { AnimatePresence, motion, useSpring, useTransform } from "motion/react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

const CALM_EASE = [0.16, 1, 0.3, 1] as const

interface Props {
  data: ManagerStatusDataMap["SHOW_LEADERBOARD"]
}

const AnimatedPoints = ({ from, to }: { from: number; to: number }) => {
  const spring = useSpring(from, { stiffness: 1000, damping: 30 })
  const display = useTransform(spring, (value) => Math.round(value))
  const [displayValue, setDisplayValue] = useState(from)

  useEffect(() => {
    spring.set(to)
    const unsubscribe = display.on("change", (latest) => {
      setDisplayValue(latest)
    })

    return unsubscribe
  }, [to, spring, display])

  return <span className="font-mono">{displayValue}</span>
}

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
      "rounded-rz-md flex size-11 shrink-0 items-center justify-center border-2 font-mono text-2xl font-bold tabular-nums 2xl:size-14 2xl:text-3xl",
      rank <= MEDAL.length
        ? MEDAL[rank - 1]
        : "border-border bg-surface text-text-muted",
    )}
  >
    {rank}
  </span>
)

const Leaderboard = ({ data: { oldLeaderboard, leaderboard } }: Props) => {
  const [displayedLeaderboard, setDisplayedLeaderboard] =
    useState(oldLeaderboard)
  const [isAnimating, setIsAnimating] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    setDisplayedLeaderboard(oldLeaderboard)
    setIsAnimating(false)

    const timer = setTimeout(() => {
      setIsAnimating(true)
      setDisplayedLeaderboard(leaderboard)
    }, 1600)

    return () => {
      clearTimeout(timer)
    }
  }, [oldLeaderboard, leaderboard])

  return (
    <section className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-2 2xl:max-w-5xl">
      <h2 className="text-text-primary mb-6 text-5xl font-bold">
        {t("game:leaderboard")}
      </h2>
      <div className="flex w-full flex-col gap-2 2xl:gap-3">
        <AnimatePresence mode="popLayout">
          {displayedLeaderboard.map(
            ({ id, username, points, streak }, index) => {
              const previous = oldLeaderboard.find((u) => u.id === id)
              const current = leaderboard.find((u) => u.id === id)
              // Only the old top five travel with the payload, so a player who
              // climbed in from further down has no known previous score.
              const gained =
                previous && current ? current.points - previous.points : 0

              return (
                <motion.div
                  key={id}
                  layout
                  initial={{ opacity: 0, y: 50 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: 50,
                    transition: { duration: 0.2 },
                  }}
                  transition={{
                    layout: {
                      duration: 0.5,
                      ease: CALM_EASE,
                    },
                  }}
                  data-leaderboard-row
                  className="bg-panel border-border text-text-primary shadow-bloom-brand rounded-rz-lg flex w-full items-center gap-4 border p-3 text-3xl font-bold 2xl:text-4xl"
                >
                  <RankBadge rank={index + 1} />

                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate">{username}</span>
                    <StreakBadge streak={streak} />
                  </span>

                  <AnimatePresence>
                    {isAnimating && gained > 0 && (
                      <motion.span
                        key="gained"
                        data-points-gained
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, ease: CALM_EASE }}
                        className="bg-success-tint border-success-border text-success shrink-0 rounded-full border px-3 py-0.5 font-mono text-xl 2xl:text-2xl"
                      >
                        +{gained}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {isAnimating ? (
                    <AnimatedPoints
                      from={previous?.points ?? 0}
                      to={current?.points ?? 0}
                    />
                  ) : (
                    <span className="font-mono">{points}</span>
                  )}
                </motion.div>
              )
            },
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

export default Leaderboard
