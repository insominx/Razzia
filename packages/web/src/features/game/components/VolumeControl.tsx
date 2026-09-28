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
  const dragging = useRef(false)
  const panelId = useId()
  const { t } = useTranslation()

  const close = () => {
    if (dragging.current) {
      return
    }

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

  const handleSliderPointerDown = (
    event: ReactPointerEvent<HTMLInputElement>,
  ) => {
    dragging.current = true
    // Pointer capture is missing in jsdom, so keep the optional calls.
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleSliderPointerUp = (
    event: ReactPointerEvent<HTMLInputElement>,
  ) => {
    dragging.current = false

    // oxlint-disable-next-line typescript/no-unnecessary-condition
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const next = document.elementFromPoint(event.clientX, event.clientY)

    if (next && ref.current && !ref.current.contains(next)) {
      close()
    }
  }

  return (
    <div
      ref={ref}
      className="relative z-50 flex items-center"
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
          className="absolute top-1/2 right-full z-50 -translate-y-1/2 pr-1"
        >
          <div className="border-border bg-surface rounded-rz-md flex items-center border px-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              onPointerDown={handleSliderPointerDown}
              onPointerUp={handleSliderPointerUp}
              onPointerCancel={handleSliderPointerUp}
              aria-label={t("common:sound.volume")}
              className="rz-volume-slider h-11 w-32"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default VolumeControl
