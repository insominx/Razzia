import { useSoundStore } from "@razzia/web/features/game/stores/sound"
import { useOnClickOutside } from "@razzia/web/hooks/useOnClickOutside"
import clsx from "clsx"
import { Volume2, VolumeX } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

const VolumeControl = () => {
  const volume = useSoundStore((s) => s.volume)
  const muted = useSoundStore((s) => s.muted)
  const setVolume = useSoundStore((s) => s.setVolume)
  const toggleMute = useSoundStore((s) => s.toggleMute)
  const unlock = useSoundStore((s) => s.unlock)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()

  useOnClickOutside({ ref, handler: () => setOpen(false) })

  const silent = muted || volume === 0
  const Icon = silent ? VolumeX : Volume2
  const label = t(muted ? "common:sound.unmute" : "common:sound.mute")

  // A tap is a click, so on touch the first press has to open the panel rather
  // than mute. Pressing while it is already open toggles: on a pointer device
  // hover opens it first, so the click still mutes on the very first press.
  const handleClick = () => {
    unlock()

    if (open) {
      toggleMute()

      return
    }

    setOpen(true)
  }

  return (
    <div
      ref={ref}
      className="relative flex items-center"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={handleClick}
        onFocus={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="border-border bg-surface text-text-body hover:border-brand rounded-rz-md ease-calm focus-visible:outline-brand flex cursor-pointer items-center justify-center border p-2 transition-colors focus:outline-none focus-visible:outline-2"
      >
        <Icon className="size-4" />
      </button>

      <div
        className={clsx(
          "border-border bg-surface rounded-rz-md ease-calm absolute top-full right-0 z-50 mt-1 flex items-center border p-2 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          aria-label={t("common:sound.volume")}
          className="rz-volume-slider"
        />
      </div>
    </div>
  )
}

export default VolumeControl
