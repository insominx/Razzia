import { pinCells } from "@razzia/web/features/game/utils/lobby"
import clsx from "clsx"

interface Props {
  code: string
  className?: string
}

/**
 * The game PIN on split-flap cards that flip into place one after another, the
 * way a departures board does. The cards are decoration over the number: a
 * screen reader reads the PIN once, and a space in it stays a gap.
 */
const FlapPin = ({ code, className }: Props) => (
  <p
    data-flap-pin={code}
    aria-label={code}
    className={clsx(
      "rz-flap-row flex items-center gap-[0.12em] font-mono",
      className,
    )}
  >
    {pinCells(code).map((char, index) =>
      char === " " ? (
        <span key={index} aria-hidden="true" className="w-[0.3em]" />
      ) : (
        <span
          key={index}
          aria-hidden="true"
          data-flap
          className="rz-flap"
          style={{ animationDelay: `${index * 90}ms` }}
        >
          {char}
        </span>
      ),
    )}
  </p>
)

export default FlapPin
