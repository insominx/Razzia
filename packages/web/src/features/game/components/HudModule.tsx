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

const VALUE_TEXT =
  "font-mono text-xl font-bold tabular-nums md:text-2xl"

const HudModule = ({ label, value, role, className, countdown }: Props) => {
  const styles = ROLE_STYLES[role]

  return (
    <div className={clsx("flex flex-col items-start gap-2", className)}>
      <span
        className={clsx(
          "pl-1 text-[0.65rem] font-bold tracking-[0.18em] uppercase",
          styles.label,
        )}
      >
        {label}
      </span>

      {countdown ? (
        <div className="relative grid size-14 place-items-center md:size-16">
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
              "relative leading-none text-text-primary",
              VALUE_TEXT,
            )}
          >
            {value}
          </span>
        </div>
      ) : (
        <div
          className={clsx(
            "rounded-rz-md border px-5 py-1.5",
            VALUE_TEXT,
            styles.box,
          )}
        >
          {value}
        </div>
      )}
    </div>
  )
}

export default HudModule
