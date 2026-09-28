import {
  RING_CIRCUMFERENCE,
  RING_RADIUS,
  ringDashOffset,
} from "@razzia/web/features/game/utils/timer-ring"
import clsx from "clsx"

type HudRole = "info" | "sequence"

interface Props {
  label: string
  value: string
  role: HudRole
  className?: string
  /** Draws a depleting ring around the value. Omit for a plain boxed readout. */
  countdown?: {
    remaining: number
    total: number
  }
}

const ROLE_STYLES: Record<HudRole, { label: string; box: string }> = {
  info: {
    label: "text-info",
    box: "border-info-border bg-panel text-text-primary",
  },
  sequence: {
    label: "text-sequence",
    box: "border-sequence-border bg-panel text-text-primary",
  },
}

const VALUE_TEXT = "font-mono text-xl font-bold tabular-nums md:text-2xl"

// Both readouts sit in a slot the ring's size, so a ring module and a boxed
// module side by side share one label baseline and one value centreline.
const VALUE_SLOT = "h-14 md:h-16 2xl:h-24"

const HudModule = ({ label, value, role, className, countdown }: Props) => {
  const styles = ROLE_STYLES[role]

  return (
    <div className={clsx("flex flex-col items-start gap-2", className)}>
      <span
        className={clsx(
          "pl-1 text-[0.65rem] font-bold tracking-[0.18em] uppercase 2xl:text-sm",
          styles.label,
        )}
      >
        {label}
      </span>

      {countdown ? (
        <div
          data-hud-slot
          className={clsx(
            "relative grid aspect-square place-items-center",
            VALUE_SLOT,
          )}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 48 48"
            className={clsx(
              "pointer-events-none absolute inset-0 -rotate-90",
              styles.label,
            )}
          >
            <circle
              cx="24"
              cy="24"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="opacity-25"
            />
            <circle
              className="rz-timer-ring transition-[stroke-dashoffset] duration-1000 ease-linear"
              cx="24"
              cy="24"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringDashOffset(
                countdown.remaining,
                countdown.total,
              )}
            />
          </svg>
          <span
            className={clsx(
              "text-text-primary relative leading-none",
              VALUE_TEXT,
            )}
          >
            {value}
          </span>
        </div>
      ) : (
        <div data-hud-slot className={clsx("flex items-center", VALUE_SLOT)}>
          <div
            className={clsx(
              "rounded-rz-md border px-5 py-1.5 2xl:px-7 2xl:py-2.5",
              VALUE_TEXT,
              styles.box,
            )}
          >
            {value}
          </div>
        </div>
      )}
    </div>
  )
}

export default HudModule
