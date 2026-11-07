import {
  heatDelayMs,
  type LineSegment,
} from "@razzia/web/features/game/utils/charge-line"
import type { CSSProperties } from "react"

type Props =
  /** Nothing to draw yet (reading), or nothing left. */
  | { mode: "idle" }
  /** Growing: a dim line from the centre, across a segment of its length. */
  | { mode: "grow"; segment: LineSegment; delayMs: number }
  /** Open and timed: bright, then burning in toward the clock. */
  | { mode: "burn"; answerSeconds: number; elapsedMs: number }
  /** Open and untimed: bright and whole, with nothing to burn. */
  | { mode: "lit" }

const style = (props: Props): CSSProperties => {
  switch (props.mode) {
    case "grow":
      return {
        "--rz-line-from": props.segment.from,
        "--rz-line-to": props.segment.to,
        "--rz-line-dur": `${props.segment.durationMs}ms`,
        "--rz-line-delay": `${props.delayMs}ms`,
      } as CSSProperties

    case "burn":
      return {
        "--rz-line-dur": `${props.answerSeconds * 1_000}ms`,
        // A late mount starts partway: a negative delay is "already this far".
        "--rz-line-delay": `${-props.elapsedMs}ms`,
        "--rz-line-heat-delay": `${heatDelayMs(props.answerSeconds) - props.elapsedMs}ms`,
      } as CSSProperties

    default:
      return {}
  }
}

/**
 * The line between the question and the answers. On the stage it runs along
 * the bottom of the clock row; on a phone it is a thin bar across the top of
 * the screen. Whichever screen draws it, the animation is plain CSS over the
 * server's stamps, so it needs no timer and survives a reconnect.
 */
const ChargeLine = (props: Props) => (
  <div
    aria-hidden="true"
    data-line={props.mode}
    className="rz-line"
    style={style(props)}
  />
)

export default ChargeLine
