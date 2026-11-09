import clsx from "clsx"

interface Props {
  value: number
  /** How long each digit takes to roll; later (lower) digits roll longer. */
  durationMs?: number
  /** False snaps straight to the value, for reduced motion. */
  roll?: boolean
  className?: string
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/** How many digits sit to the right of `index`: the commas do not count. */
const digitsToRight = (chars: string[], index: number): number =>
  chars.slice(index + 1).filter((char) => /\d/.test(char)).length

/**
 * A number whose digits roll like an odometer. Each digit is a column of 0–9
 * that slides to the right one, so a score visibly counts up through the
 * numbers in between instead of changing in a blink. Commas stay put. The text
 * a screen reader gets is just the number.
 */
const Odometer = ({
  value,
  durationMs = 1_400,
  roll = true,
  className,
}: Props) => {
  const text = Math.max(0, Math.round(value)).toLocaleString("en-US")
  const chars = text.split("")

  return (
    <span
      data-odometer={value}
      className={clsx("inline-flex tabular-nums", className)}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex">
        {chars.map((char, index) => {
          // Counted from the right, so a column keeps its place as the number
          // grows a digit and the lowest digits roll the longest.
          const fromRight = chars.length - 1 - index

          if (!/\d/.test(char)) {
            return (
              <span key={`c${fromRight}`} className="inline-block">
                {char}
              </span>
            )
          }

          return (
            <span
              key={`d${fromRight}`}
              className="rz-odo-digit"
              style={{ width: "0.62em" }}
            >
              <span
                className="rz-odo-strip"
                style={{
                  transform: `translateY(${Number(char) * -10}%)`,
                  transitionDuration: roll
                    ? `${durationMs + digitsToRight(chars, index) * 90}ms`
                    : "0ms",
                }}
              >
                {DIGITS.map((digit) => (
                  <span key={digit}>{digit}</span>
                ))}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}

export default Odometer
