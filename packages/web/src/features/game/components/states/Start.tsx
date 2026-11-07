import { EVENTS } from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { score } from "@razzia/web/features/game/audio"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import { useLaunchStore } from "@razzia/web/features/game/stores/launch"
import { useEffect, useState } from "react"

interface Props {
  data: CommonStatusDataMap["SHOW_START"]
}

/**
 * The start: the quiz's title with a pass of light across it, then one lamp for
 * each second of the countdown, like the lights on a starting grid. GO is the
 * first round card's to flash (`useLaunchStore`), because the lamps end exactly
 * as it replaces them.
 */
const Start = ({ data: { time, subject } }: Props) => {
  const [counting, setCounting] = useState(false)
  const [cooldown, setCooldown] = useState(time)

  // The title's own stinger, then (below) three clunks and a GO, scheduled
  // together as one scene so the lamps and their sound cannot drift apart.
  useEffect(() => {
    score.start({ scene: "title" })
  }, [])

  useEvent(EVENTS.GAME.START_COOLDOWN, () => {
    setCounting(true)
    useLaunchStore.getState().arm()
    score.start({ scene: "lamps" })
  })

  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    setCooldown(sec)
  })

  // The first lamp lights as the countdown starts, one more with each second.
  const lit = counting ? Math.min(time, time - cooldown + 1) : 0

  return (
    <section className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col items-center justify-center gap-10 px-6">
      {counting ? (
        <>
          <div data-lamps className="stage:gap-14 flex items-center gap-6">
            {Array.from({ length: time }, (_, index) => (
              <span
                key={index}
                data-lamp={index < lit ? "on" : "off"}
                className="rz-lamp stage:size-[13rem] size-24"
              />
            ))}
          </div>
          <span
            data-start-count
            className="text-text-primary stage:text-[9rem] font-mono text-7xl font-extrabold tabular-nums"
          >
            {cooldown}
          </span>
        </>
      ) : (
        <h2
          data-start-title
          className="rz-title-sweep stage:text-[7rem] stage:leading-[1.05] text-center text-5xl font-extrabold text-balance"
        >
          {subject}
        </h2>
      )}
    </section>
  )
}

export default Start
