import { useSoundStore } from "@razzia/web/features/game/stores/sound"
import { useOnClickOutside } from "@razzia/web/hooks/useOnClickOutside"
import { Volume2, VolumeX } from "lucide-react"
import {
  type PointerEvent as ReactPointerEvent,
  useId,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

const VolumeControl = () => {
  const volume = useSoundStore((s) => s.volume)
  const muted = useSoundStore((s) => s.muted)
  const setVolume = useSoundStore((s) => s.setVolume)
  const toggleMute = useSoundStore((s) => s.toggleMute)
  const unlock = useSoundStore((s) => s.unlock)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const openedByTouchPress = useRef(false)
  const panelId = useId()
  const { t } = useTranslation()

  const close = () => {
    openedByTouchPress.current = false
    setOpen(false)
  }

  useOnClickOutside({ ref, handler: close })

  const silent = muted || volume === 0
  const Icon = silent ? VolumeX : Volume2
  const label = t(muted ? "common:sound.unmute" : "common:sound.mute")

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch" && !open) {
      openedByTouchPress.current = true
      setOpen(true)
    }
  }

  const handleClick = () => {
    unlock()

    if (openedByTouchPress.current) {
      openedByTouchPress.current = false

      return
    }

    setOpen(true)
    toggleMute()
  }

  const handlePointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      setOpen(true)
    }
  }

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      close()
    }
  }

  return (
    <div
      ref={ref}
      className="relative flex items-center"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerCancel={() => {
          openedByTouchPress.current = false
        }}
        onClick={handleClick}
        onFocus={() => setOpen(true)}
        aria-label={label}
        aria-controls={panelId}
        aria-expanded={open}
        title={label}
        className="border-border bg-surface text-text-body hover:border-brand rounded-rz-md ease-calm focus-visible:outline-brand flex cursor-pointer items-center justify-center border p-2 transition-colors focus:outline-none focus-visible:outline-2"
      >
        <Icon className="size-4" />
      </button>

      {open && (
        <div
          id={panelId}
          className="border-border bg-surface rounded-rz-md ease-calm absolute top-full right-0 z-50 mt-1 flex items-center border p-2 transition-opacity"
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
      )}
    </div>
  )
}

export default VolumeControl
