import type { CSSProperties, ReactNode } from "react"

interface Props {
  /**
   * `time` floods hot from the middle, once, and clears. `strike` floods green
   * from a tile (the right answer's), fills the frame, and collapses back into
   * it. Both take the whole frame in one solid colour with black type: in a lit
   * room a blackout only dims the picture by a fifth, but a full-frame fill
   * brightens it almost five times, so big moments go brighter, not darker.
   * `winner` is the finale's: the winner's name, full frame in gold, held and
   * then cleared to the podium. `go` is the first question's start.
   */
  kind: "time" | "strike" | "verdict" | "winner" | "go"
  /** For `strike`: the tile it floods from and settles into, in page pixels. */
  from?: { top: number; right: number; bottom: number; left: number }
  /** For `verdict`, a phone's colour for right, wrong or no answer. */
  color?: string
  /** Milliseconds already gone: a late arrival joins the flood part-way. */
  elapsedMs?: number
  children: ReactNode
}

/**
 * The whole frame in one colour. It owns nothing but the flood: the words are
 * its children, and a screen decides when to mount and unmount it. It is pure
 * CSS over its start offset, so it needs no timer of its own.
 */
const FrameHit = ({ kind, from, color, elapsedMs = 0, children }: Props) => {
  const inset = from
    ? `${from.top}px ${from.right}px ${from.bottom}px ${from.left}px`
    : "50% 50% 50% 50%"
  const style = {
    "--rz-hit-inset": inset,
    "--rz-hit-delay": `${-Math.max(0, elapsedMs)}ms`,
    ...(color ? { "--rz-hit-color": color } : {}),
  } as CSSProperties

  return (
    <div role="presentation" data-hit={kind} className="rz-hit" style={style}>
      {children}
    </div>
  )
}

export default FrameHit
