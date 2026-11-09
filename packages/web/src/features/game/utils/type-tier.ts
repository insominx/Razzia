import { splitQuestionSentences } from "@razzia/common/utils/question-transition"
import type { CSSProperties } from "react"

/**
 * Every question gets one type size for its prompt and one for its answers,
 * decided here from the text alone, so the prompt keeps its size from the
 * question screen to the answers to the results and the shared-layout morph
 * between them never reflows. Lengths are `rem` on the stage, where `1rem` is
 * 16 px at exactly 1920x1080 and nothing the room reads is under 2.6875rem
 * (43 px, the smallest the back row can make out).
 *
 * The estimate is deliberately cautious; the Director's fit report measures
 * the real layout of every real question and is the judge.
 */

/** Width the prompt may use on the stage, and the height it may take. */
export const PROMPT_WIDTH_REM = 105

/**
 * What is left of the 67.5 rem frame for the prompt once the rest of the
 * answers screen is placed: the question label (2.75), the clock row (7), the
 * tiles (2 x 13.5 and a 1 rem gap) and the bottom 8% (5.4). Measured in the
 * browser, the zone is 27.1 rem tall and its label and spacing take about 2.6
 * of it, which leaves 24.5. The teacher's controls float over the corners and
 * take no room.
 */
export const PROMPT_BUDGET_REM = 24.2

export interface PromptTier {
  /** The real question: the last sentence. */
  ask: number
  /** The sentences before it. */
  ctx: number
}

export const PROMPT_TIERS: readonly PromptTier[] = [
  { ask: 6, ctx: 3.25 },
  { ask: 5, ctx: 3 },
  { ask: 4, ctx: 2.75 },
  { ask: 3.25, ctx: 2.6875 },
]

/** Average advance of the display face, in em: bold copy runs wide. */
const CHAR_EM = 0.56
const ASK_LEADING = 1.04
const CTX_LEADING = 1.18
const BLOCK_GAP_REM = 0.5

const lineCount = (text: string, fontRem: number): number => {
  const perLine = Math.max(
    1,
    Math.floor(PROMPT_WIDTH_REM / (fontRem * CHAR_EM)),
  )

  return text
    .split("\n")
    .reduce(
      (lines, row) => lines + Math.max(1, Math.ceil(row.length / perLine)),
      0,
    )
}

/** One sentence of the prompt, as it is drawn: context above, the ask below. */
export interface PromptSentence {
  /** Lines that set the scene, in the smaller type. May be empty. */
  lead: string
  /** The real question, in the biggest type. Only the last sentence has one. */
  ask: string | null
}

/**
 * The prompt as sentences, in the order the server reveals them (the same
 * split as `splitQuestionSentences`, so a sentence's index is its reveal
 * step). The last sentence's last line is the ask: a question that ends in a
 * code block still asks on its final line, and the code above it is context.
 * Runs of blank lines collapse to one line break, so a code block costs its
 * own lines and nothing more.
 */
export const promptSentences = (question: string): PromptSentence[] => {
  const sentences = splitQuestionSentences(question)

  return sentences.map((text, index) => {
    // Quizzes written on Windows carry `\r\n`; normalise before collapsing.
    const lines = text
      .replace(/\r\n?/gu, "\n")
      .replace(/\n{2,}/gu, "\n")
      .split("\n")

    if (index < sentences.length - 1) {
      return { lead: lines.join("\n"), ask: null }
    }

    const ask = lines.pop() ?? ""

    return { lead: lines.join("\n"), ask }
  })
}

/** The height a prompt would take at a tier, in rem. */
export const promptHeightRem = (question: string, tier: PromptTier): number =>
  promptSentences(question).reduce((sum, { lead, ask }) => {
    const leadHeight = lead
      ? lineCount(lead, tier.ctx) * tier.ctx * CTX_LEADING + BLOCK_GAP_REM
      : 0
    const askHeight =
      ask === null ? 0 : lineCount(ask, tier.ask) * tier.ask * ASK_LEADING

    return sum + leadHeight + askHeight
  }, 0)

/** The largest tier whose prompt fits; the smallest when none does. */
export const promptTier = (question: string): PromptTier =>
  PROMPT_TIERS.find(
    (tier) => promptHeightRem(question, tier) <= PROMPT_BUDGET_REM,
  ) ?? PROMPT_TIERS[PROMPT_TIERS.length - 1]

/** Answer copy: 50, 46 or 43 px at 1080p, by how long the longest answer is. */
export const ANSWER_FONT_STEPS: ReadonlyArray<{ upTo: number; rem: number }> = [
  { upTo: 48, rem: 3.125 },
  { upTo: 62, rem: 2.875 },
  { upTo: Number.POSITIVE_INFINITY, rem: 2.6875 },
]

export const answerFontRem = (answers: readonly string[]): number => {
  const longest = Math.max(0, ...answers.map((answer) => answer.length))

  return (
    ANSWER_FONT_STEPS.find((step) => longest <= step.upTo)?.rem ??
    ANSWER_FONT_STEPS[ANSWER_FONT_STEPS.length - 1].rem
  )
}

/** Custom properties the stage styles read: `stage:text-(length:--rz-ask)`. */
export const promptVars = (question: string): CSSProperties => {
  const { ask, ctx } = promptTier(question)

  return { "--rz-ask": `${ask}rem`, "--rz-ctx": `${ctx}rem` } as CSSProperties
}

export const answerVars = (answers: readonly string[]): CSSProperties =>
  ({ "--rz-ans": `${answerFontRem(answers)}rem` }) as CSSProperties
