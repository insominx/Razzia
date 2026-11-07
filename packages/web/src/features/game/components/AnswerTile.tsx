import {
  ANSWER_COLOR_VARS,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/game-constants"
import clsx from "clsx"
import { Check } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

/**
 * - `locked`: shown, not yet answerable. The block is unlit.
 * - `active`: answerable. Bright means go.
 * - `picked` / `faded`: this phone's own pick, and the others stepping back.
 * - `result`: a vote count, no verdict yet.
 * - `correct` / `wrong`: the verdict on a result.
 */
export type TileState =
  | "locked"
  | "active"
  | "picked"
  | "faded"
  | "result"
  | "correct"
  | "wrong"

interface Props {
  /** 0–3: picks the letter and the colour. */
  index: number
  state: TileState
  children: ReactNode
  /** A vote share: the percentage lands in the block, the rail runs below. */
  share?: { percent: number; count: number }
  /** The most-picked answer, held in the light while the room waits. */
  spot?: boolean
  /** Makes the tile a real button. Without it the tile is a static panel. */
  onClick?: () => void
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * One answer: a solid letter block beside words on dark glass. A tile is a
 * button only where somebody can tap it (a phone with answers open); on the
 * projector and in results it is a plain panel, so it can never take a hover
 * or a focus ring it has no use for.
 */
const AnswerTile = ({
  index,
  state,
  children,
  share,
  spot,
  onClick,
  disabled,
  className,
  style,
}: Props) => {
  const label = ANSWERS_LABELS[index]
  const interactive = onClick !== undefined
  const props = {
    "data-answer-tile": "",
    "data-answer": label,
    "data-state": state,
    "data-share": share ? "" : undefined,
    "data-spot": spot ? "" : undefined,
    className: clsx("rz-tile", className),
    style: {
      "--c": `var(${ANSWER_COLOR_VARS[index]})`,
      ...style,
    } as CSSProperties,
  }

  const content = (
    <>
      <span data-fit-box className="rz-tile-clip">
        <span className="rz-tile-block" aria-hidden="true">
          {label}
          {share && (
            <span className="rz-tile-share font-mono tabular-nums">
              {share.percent}%
            </span>
          )}
        </span>
        <span className="rz-tile-text">{children}</span>
        {share && (
          <span className="rz-tile-rail" aria-hidden="true">
            <span
              className="rz-tile-bar"
              style={{ width: `${share.percent}%` }}
            />
          </span>
        )}
      </span>
      {state === "correct" && (
        <span className="rz-tile-badge" role="img" aria-label="Correct">
          <Check className="size-3/5 stroke-[5]" aria-hidden="true" />
        </span>
      )}
    </>
  )

  return interactive ? (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {content}
    </button>
  ) : (
    <div {...props}>{content}</div>
  )
}

export default AnswerTile
