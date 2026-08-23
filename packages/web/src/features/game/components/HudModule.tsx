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
  /** Draws a depleting ring beside the value. Omit for a plain readout. */
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

const HudModule = ({ label, value, role, className, countdown }: Props) => {
  const styles = ROLE_STYLES[role]

  return (
    <div className={clsx("flex flex-col items-start", className)}>
      <span
        className={clsx(
          "mb-1 pl-1 text-[0.65rem] font-bold tracking-[0.18em] uppercase",
          styles.label,
        )}
      >
        {label}
      </span>

      <div className="relative">
        {countdown && (
          <svg
            aria-hidden="true"
            viewBox="0 0 48 48"
            className={clsx(
              "absolute top-1/2 -right-5 z-0 size-12 -translate-y-1/2 -rotate-90",
              styles.label,
            )}
          >
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
        )}

        <div
          className={clsx(
            "rounded-rz-md relative z-10 border px-5 py-1.5 font-mono text-xl font-bold tabular-nums md:text-2xl",
            styles.box,
          )}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

export default HudModule
