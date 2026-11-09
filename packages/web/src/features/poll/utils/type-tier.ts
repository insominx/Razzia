// A poll's question and options are written by a person and can be anything
// from "Ready?" to a paragraph, so their size is chosen from the text alone,
// like a quiz question's (`features/game/utils/type-tier.ts`). The tiers are
// an estimate; the real layout is checked by eye at the projector's size.

export type PollTextTier = "short" | "medium" | "long"

const tierOf = (length: number, shortUpTo: number, mediumUpTo: number) => {
  if (length <= shortUpTo) {
    return "short"
  }

  return length <= mediumUpTo ? "medium" : "long"
}

export const questionTier = (question: string): PollTextTier =>
  tierOf(question.length, 70, 160)

/** One tier for every option, from the longest, so the rows stay alike. */
export const optionTier = (options: string[]): PollTextTier =>
  tierOf(Math.max(0, ...options.map((option) => option.length)), 24, 60)

// Four or more options would not fit the projector's height in one column, so
// the stage sets them in two.
export const TWO_COLUMNS_FROM = 4

// The same sizes in pixels at the stage's 1920×1080 (1rem is 16 px), which the
// fit estimate (`stage-fit.ts`) works in. A test keeps them equal to the
// classes below.
export const QUESTION_STAGE_PX: Record<PollTextTier, number> = {
  short: 72,
  medium: 56,
  long: 43,
}

export const OPTION_STAGE_PX: Record<PollTextTier, number> = {
  short: 56,
  medium: 48,
  long: 43,
}

// Room-readable: nothing the room has to read is under 2.6875rem on the stage.
export const QUESTION_CLASSES: Record<PollTextTier, string> = {
  short: "text-2xl stage:text-[4.5rem]",
  medium: "text-xl stage:text-[3.5rem]",
  long: "text-lg stage:text-[2.6875rem]",
}

export const OPTION_CLASSES: Record<PollTextTier, string> = {
  short: "text-xl stage:text-[3.5rem]",
  medium: "text-lg stage:text-[3rem]",
  long: "text-base stage:text-[2.6875rem]",
}
