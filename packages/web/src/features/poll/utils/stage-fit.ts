import {
  OPTION_STAGE_PX,
  optionTier,
  QUESTION_STAGE_PX,
  questionTier,
  TWO_COLUMNS_FROM,
} from "@razzia/web/features/poll/utils/type-tier"

// Whether a poll's words will fit the projector without scrolling, estimated
// from their length alone, at 1920×1080 (the stage is that composition at any
// size). The numbers were measured on the real layout (`PollBars` inside the
// host overlay); `stage-fit.test.ts` holds the measurements and keeps the
// estimate within a few percent of them. It is a warning for the author, not a
// rule: the poll still runs, and scrolls, when it does not fit.

export interface PollWords {
  question: string
  options: string[]
  anonymous?: boolean
}

const FRAME_PX = 1080
// The stage column (105rem).
const COLUMN_PX = 1680
// The words of an option, after the letter block and the count have taken
// their share: in one of two columns, and in a single column.
const TWO_COLUMN_TEXT_PX = 600
const ONE_COLUMN_TEXT_PX = 1250
// Average glyph width in em, with the slack that wrapping at word ends costs.
const GLYPH_EM = 0.47
const LEADING = 1.25
// A row's padding and rail, and the least height its letter block gives it.
const ROW_FIXED_PX = 60
const ROW_MIN_PX = 104
// A named poll lists voters under each option.
const ROW_NAMES_PX = 40
const ROW_GAP_PX = 16
// The label, the "voted" line, the gaps and the top padding above the list.
const HEAD_PX = 245
// The bottom of the frame, where heads in the room hide the screen.
const BOTTOM_RESERVE_PX = 86

const linesOf = (length: number, fontPx: number, widthPx: number): number => {
  const perLine = Math.max(1, Math.floor(widthPx / (GLYPH_EM * fontPx)))

  return Math.max(1, Math.ceil(length / perLine))
}

/** How tall the poll is on the projector, in pixels at 1920×1080. */
export const estimateStageHeight = ({
  question,
  options,
  anonymous = true,
}: PollWords): number => {
  const questionPx = QUESTION_STAGE_PX[questionTier(question)]
  const optionPx = OPTION_STAGE_PX[optionTier(options)]
  const questionHeight =
    linesOf(question.length, questionPx, COLUMN_PX) * LEADING * questionPx

  const rowHeight = (lengths: number[], widthPx: number) => {
    const lines = Math.max(
      ...lengths.map((length) => linesOf(length, optionPx, widthPx)),
    )

    return (
      Math.max(ROW_MIN_PX, ROW_FIXED_PX + lines * LEADING * optionPx) +
      (anonymous ? 0 : ROW_NAMES_PX)
    )
  }

  const lengths = options.map((option) => option.length)
  const rows: number[] = []

  if (options.length < TWO_COLUMNS_FROM) {
    lengths.forEach((length) => {
      rows.push(rowHeight([length], ONE_COLUMN_TEXT_PX))
    })
  } else {
    for (let at = 0; at < lengths.length; at += 2) {
      const pair = lengths.slice(at, at + 2)

      // A lone last option spans both columns.
      rows.push(
        pair.length === 1
          ? rowHeight(pair, ONE_COLUMN_TEXT_PX)
          : rowHeight(pair, TWO_COLUMN_TEXT_PX),
      )
    }
  }

  const list =
    rows.reduce((total, row) => total + row, 0) +
    ROW_GAP_PX * Math.max(0, rows.length - 1)

  return HEAD_PX + questionHeight + list + BOTTOM_RESERVE_PX
}

/** True when the poll is estimated to be taller than the projector. */
export const mayNotFitStage = (words: PollWords): boolean =>
  estimateStageHeight(words) > FRAME_PX
