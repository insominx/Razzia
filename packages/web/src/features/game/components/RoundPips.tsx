import clsx from "clsx"

/** More questions than this and a pip each would be a smear: draw a bar. */
export const MAX_PIPS = 12

const pipState = (
  number: number,
  current: number,
  done: readonly number[] | undefined,
) => {
  if (number === current) {
    return "now"
  }

  const finished = done ? done.includes(number) : number < current

  return finished ? "done" : "next"
}

interface Props {
  /** 1-based: the question on screen. */
  current: number
  total: number
  /**
   * 1-based: the questions already played, for a lecture deck that plays them
   * out of order. Without it, every lower number has been played.
   */
  done?: readonly number[]
  className?: string
}

/**
 * Where the round is in the quiz: one pip per question, the finished ones solid
 * and the current one lit. A long lecture deck draws a progress bar instead.
 */
const RoundPips = ({ current, total, done, className }: Props) => {
  if (total > MAX_PIPS) {
    // The bar is how much has been played, this question included.
    const played = done ? done.length + 1 : current

    return (
      <div
        data-round-progress={current}
        role="img"
        aria-label={`${current} / ${total}`}
        className={clsx(
          "bg-surface stage:h-4 stage:w-[28rem] h-3 w-64 overflow-hidden rounded-full",
          className,
        )}
      >
        <div
          className="bg-brand h-full rounded-full"
          style={{ width: `${Math.min(100, (played / total) * 100)}%` }}
        />
      </div>
    )
  }

  return (
    <div
      role="img"
      aria-label={`${current} / ${total}`}
      className={clsx("stage:gap-5 flex items-center gap-3", className)}
    >
      {Array.from({ length: total }, (_, index) => {
        const state = pipState(index + 1, current, done)

        return (
          <span
            key={index}
            data-pip={state}
            className={clsx(
              "stage:size-7 size-4 rounded-full border-2",
              state === "done" && "bg-brand border-brand",
              state === "now" &&
                "bg-brand border-brand scale-150 shadow-[0_0_1.5rem_var(--rz-brand)]",
              state === "next" && "bg-surface border-border",
            )}
          />
        )
      })}
    </div>
  )
}

export default RoundPips
