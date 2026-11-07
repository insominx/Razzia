import clsx from "clsx"

type HudRole = "info" | "sequence"

interface Props {
  label: string
  value: string
  role: HudRole
  className?: string
  /** Time is short: the digit grows and heats up, and pulses on every tick. */
  urgent?: boolean
}

const ROLE_LABEL: Record<HudRole, string> = {
  info: "text-info",
  sequence: "text-sequence",
}

/**
 * One large number with a small label: the clock, or how many have answered.
 * The digit is the thing read from the back of the room, so it is big and
 * plain; the label is the only small type here.
 */
const HudModule = ({
  label,
  value,
  role,
  className,
  urgent = false,
}: Props) => (
  <div className={clsx("flex flex-col items-start", className)}>
    <span
      className={clsx(
        "stage:text-[1.125rem] text-xs font-bold tracking-[0.18em] uppercase",
        ROLE_LABEL[role],
      )}
    >
      {label}
    </span>
    <span
      // A new key restarts the pulse each second of the last five.
      key={urgent ? value : "calm"}
      data-hud-value
      className={clsx(
        "font-display leading-none font-bold tabular-nums",
        "stage:text-[5rem] text-[2.25rem]",
        urgent ? "text-warning rz-hud-hot" : "text-text-primary",
      )}
    >
      {value}
    </span>
  </div>
)

export default HudModule
