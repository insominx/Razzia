import { EVENTS } from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { useEvent } from "@razzia/web/features/game/contexts/socket-context"
import { useSfx } from "@razzia/web/features/game/hooks/use-sfx"
import { SFX, sfxVolume } from "@razzia/web/features/game/utils/constants"
import { useState } from "react"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_START"]
}

const Start = ({ data: { time, subject } }: Props) => {
  const [showTitle, setShowTitle] = useState(true)
  const [cooldown, setCooldown] = useState(time)
  const sfx = useSfx()

  const boumpSrc = sfx(SFX.BOUMP_SOUND)
  const [sfxBoump] = useSound(boumpSrc, { volume: sfxVolume(boumpSrc) })

  useEvent(EVENTS.GAME.START_COOLDOWN, () => {
    sfxBoump()
    setShowTitle(false)
  })

  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    sfxBoump()
    setCooldown(sec)
  })

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      {showTitle ? (
        <h2 className="anim-show text-text-primary text-center text-3xl font-bold md:text-4xl lg:text-5xl">
          {subject}
        </h2>
      ) : (
        <>
          <div className="anim-show aspect-square h-32 md:h-60">
            <div
              className="bg-brand rounded-rz-xl ease-calm size-full transition-transform"
              style={{
                transform: `rotate(${45 * (time - cooldown)}deg)`,
              }}
            ></div>
          </div>
          <span className="text-on-accent absolute text-6xl font-bold md:text-8xl">
            {cooldown}
          </span>
        </>
      )}
    </section>
  )
}

export default Start
