import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import { useSfx } from "@razzia/web/features/game/hooks/use-sfx"
import {
  MEDAL,
  SFX,
  sfxVolume,
} from "@razzia/web/features/game/utils/constants"
import useScreenSize from "@razzia/web/hooks/useScreenSize"
import clsx from "clsx"
import { useEffect, useState } from "react"
import ReactConfetti from "react-confetti"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["FINISHED"]
}

const usePodiumAnimation = (topLength: number) => {
  const [apparition, setApparition] = useState(0)

  const sfx = useSfx()

  const threeSrc = sfx(SFX.PODIUM.THREE)
  const secondSrc = sfx(SFX.PODIUM.SECOND)
  const roolSrc = sfx(SFX.PODIUM.SNEAR_ROOL)
  const firstSrc = sfx(SFX.PODIUM.FIRST)

  const [sfxtThree] = useSound(threeSrc, { volume: sfxVolume(threeSrc) })
  const [sfxSecond] = useSound(secondSrc, { volume: sfxVolume(secondSrc) })
  const [sfxRool, { stop: sfxRoolStop }] = useSound(roolSrc, {
    volume: sfxVolume(roolSrc),
  })
  const [sfxFirst] = useSound(firstSrc, { volume: sfxVolume(firstSrc) })

  useEffect(() => {
    const actions: Partial<Record<number, () => void>> = {
      4: () => {
        sfxRoolStop()
        sfxFirst()
      },
      3: sfxRool,
      2: sfxSecond,
      1: sfxtThree,
    }

    actions[apparition]?.()
  }, [apparition, sfxFirst, sfxSecond, sfxtThree, sfxRool, sfxRoolStop])

  useEffect(() => {
    if (topLength < 3) {
      setApparition(4)

      return
    }

    if (apparition >= 4) {
      return
    }

    const interval = setInterval(() => {
      setApparition((value) => value + 1)
    }, 2000)

    return () => clearInterval(interval)
  }, [apparition, topLength])

  return apparition
}

// Confetti draws from the same palette as the rest of the stage instead of
// the library's rainbow. The canvas needs literal colours, so the tokens are
// resolved once from the root; an empty read falls back to the default set.
const CONFETTI_TOKENS = [
  "--rz-answer-a",
  "--rz-answer-b",
  "--rz-answer-c",
  "--rz-answer-d",
  "--rz-brand",
  "--rz-medal-gold",
]

const readConfettiColors = (): string[] | undefined => {
  const styles = getComputedStyle(document.documentElement)
  const colors = CONFETTI_TOKENS.map((token) =>
    styles.getPropertyValue(token).trim(),
  ).filter(Boolean)

  return colors.length > 0 ? colors : undefined
}

// Names wrap to two lines and clip inside their column rather than widening
// it; `shrink-0` so the podium block below gives way instead of the name.
const PODIUM_NAME =
  "text-text-primary line-clamp-2 w-full shrink-0 px-2 text-center text-2xl font-bold text-balance wrap-break-word md:text-4xl"

const Medal = ({ rank }: { rank: number }) => (
  <div
    className={clsx(
      "relative flex aspect-square size-20 items-center justify-center overflow-hidden rounded-full border-8 text-5xl font-extrabold md:size-26 md:border-10 md:text-6xl",
      MEDAL[rank - 1],
    )}
  >
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
      <div className="bg-text-primary/25 absolute top-[30%] left-1/2 h-6 w-[160%] -translate-x-1/2 -rotate-40" />
      <div className="bg-text-primary/25 absolute top-[70%] left-1/2 h-3 w-[160%] -translate-x-1/2 -rotate-40" />
    </div>
    <p className="relative z-10 font-mono">{rank}</p>
  </div>
)

const Podium = ({ data: { subject, top } }: Props) => {
  const apparition = usePodiumAnimation(top.length)

  const { width, height } = useScreenSize()
  const [confettiColors] = useState(readConfettiColors)

  return (
    <>
      {apparition >= 4 && (
        <ReactConfetti
          width={width}
          height={height}
          colors={confettiColors}
          className="h-full w-full"
        />
      )}

      {apparition >= 3 && top.length >= 3 && (
        <div className="pointer-events-none absolute min-h-dvh w-full overflow-hidden">
          <div className="spotlight"></div>
        </div>
      )}
      <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-between">
        <h2 className="anim-show text-text-primary text-center text-3xl font-bold md:text-4xl lg:text-5xl">
          {subject}
        </h2>

        <div
          style={{
            gridTemplateColumns: `repeat(${top.length}, minmax(0, 1fr))`,
          }}
          className={`grid w-full max-w-200 flex-1 items-end justify-center justify-self-end overflow-x-visible overflow-y-hidden`}
        >
          {top[1] && (
            <div
              className={clsx(
                "z-20 flex h-[50%] w-full translate-y-full flex-col items-center justify-center gap-3 opacity-0 transition-all",
                { "translate-y-0! opacity-100": apparition >= 2 },
              )}
            >
              <p
                className={clsx(PODIUM_NAME, {
                  "anim-balanced": apparition >= 4,
                })}
              >
                {top[1].username}
              </p>
              <div className="bg-panel border-border text-text-primary shadow-bloom-brand flex h-full w-full flex-col items-center gap-4 rounded-t-xl border-x border-t pt-6 text-center">
                <Medal rank={2} />
                <p className="font-mono text-3xl font-bold md:text-4xl">
                  {top[1].points}
                </p>
              </div>
            </div>
          )}

          <div
            className={clsx(
              "z-30 flex h-[60%] w-full translate-y-full flex-col items-center gap-3 opacity-0 transition-all",
              {
                "translate-y-0! opacity-100": apparition >= 3,
              },
              {
                "md:min-w-64": top.length < 2,
              },
            )}
          >
            <p
              className={clsx(PODIUM_NAME, "opacity-0", {
                "anim-balanced opacity-100": apparition >= 4,
              })}
            >
              {top[0].username}
            </p>
            <div className="bg-panel border-border text-text-primary shadow-bloom-brand flex h-full w-full flex-col items-center gap-4 rounded-t-xl border-x border-t pt-6 text-center">
              <Medal rank={1} />
              <p className="font-mono text-3xl font-bold md:text-4xl">
                {top[0].points}
              </p>
            </div>
          </div>

          {top[2] && (
            <div
              className={clsx(
                "z-10 flex h-[40%] w-full translate-y-full flex-col items-center gap-3 opacity-0 transition-all",
                {
                  "translate-y-0! opacity-100": apparition >= 1,
                },
              )}
            >
              <p
                className={clsx(PODIUM_NAME, {
                  "anim-balanced": apparition >= 4,
                })}
              >
                {top[2].username}
              </p>
              <div className="bg-panel border-border text-text-primary shadow-bloom-brand flex h-full w-full flex-col items-center gap-4 rounded-t-xl border-x border-t pt-6 text-center">
                <Medal rank={3} />

                <p className="font-mono text-3xl font-bold md:text-4xl">
                  {top[2].points}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

export default Podium
