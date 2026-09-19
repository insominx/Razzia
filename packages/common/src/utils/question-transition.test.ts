import {
  QUESTION_CONTENT_ENTER_MS,
  QUESTION_NUMBER_FADE_MS,
  QUESTION_NUMBER_INTRO_MS,
  QUESTION_SENTENCE_FADE_MS,
  QUESTION_SENTENCE_MIN_DWELL_MS,
  QUESTION_SENTENCE_MS_PER_CHAR,
  getNextSentenceRevealElapsed,
  getQuestionPromptRevealMs,
  getQuestionSentenceFadeMs,
  getQuestionSentenceIntervalMs,
  getQuestionSentenceStartElapsed,
  getVisibleSentenceCount,
  splitQuestionSentences,
} from "@razzia/common/utils/question-transition"
import { describe, expect, it } from "vitest"

const TWO =
  "You change a normal C# field on one game instance, but the value on another instance stays the same. Why?"
const THREE =
  "A door is opened during the game. Players joining later should see that it is already open. How should its open/closed state normally be synchronized?"
const FOUR =
  "You host a game at home. Your friend's home uses the same private address range as yours. They enter your PC's private LAN address to join. Where does their PC look for that destination?"

const revealMs = (text: string): number => {
  const sentences = splitQuestionSentences(text)

  if (sentences.length <= 1) {
    return QUESTION_CONTENT_ENTER_MS
  }

  return (
    sentences
      .slice(0, -1)
      .reduce(
        (sum, sentence) => sum + getQuestionSentenceIntervalMs(sentence),
        0,
      ) + QUESTION_SENTENCE_FADE_MS
  )
}

describe("question transition timing", () => {
  it("locks the number intro and question entrance beats", () => {
    expect(QUESTION_NUMBER_INTRO_MS).toBe(1_000)
    expect(QUESTION_NUMBER_FADE_MS).toBe(500)
    expect(QUESTION_CONTENT_ENTER_MS).toBe(950)
  })

  it("finishes the number fade before the intro status advances", () => {
    expect(QUESTION_NUMBER_FADE_MS).toBeLessThanOrEqual(
      QUESTION_NUMBER_INTRO_MS,
    )
  })

  it("locks the sentence fade and high-comprehension character clock", () => {
    expect(QUESTION_SENTENCE_FADE_MS).toBe(500)
    expect(QUESTION_SENTENCE_MS_PER_CHAR).toBe(80)
    expect(QUESTION_SENTENCE_MIN_DWELL_MS).toBe(400)
  })
})

describe("splitQuestionSentences", () => {
  it("keeps a one-line prompt as a single sentence", () => {
    expect(splitQuestionSentences("Which boundary owns this state?")).toEqual([
      "Which boundary owns this state?",
    ])
  })

  it("splits a setup sentence from Why?", () => {
    expect(splitQuestionSentences(TWO)).toEqual([
      "You change a normal C# field on one game instance, but the value on another instance stays the same.",
      "Why?",
    ])
  })

  it("returns the original string when nothing remains after the split", () => {
    expect(splitQuestionSentences("")).toEqual([""])
    expect(splitQuestionSentences("   ")).toEqual(["   "])
  })

  it("trims extra spaces between sentences and a prompt with no terminator", () => {
    expect(splitQuestionSentences("Setup one.    Why?")).toEqual([
      "Setup one.",
      "Why?",
    ])
    expect(
      splitQuestionSentences("Which boundary owns the persisted state"),
    ).toEqual(["Which boundary owns the persisted state"])
  })
})

describe("question prompt reveal schedule", () => {
  it("times each sentence from its character count", () => {
    expect(getQuestionSentenceIntervalMs("Why?")).toBe(900)
    expect(getQuestionSentenceIntervalMs("Why?")).toBe(
      QUESTION_SENTENCE_FADE_MS + QUESTION_SENTENCE_MIN_DWELL_MS,
    )

    const long =
      "Your friend's home uses the same private address range as yours."
    expect(long).toHaveLength(64)
    expect(getQuestionSentenceIntervalMs(long)).toBe(5_620)
  })

  it.each([
    [1, "Pick one"],
    [2, TWO],
    [3, THREE],
    [4, FOUR],
  ])(
    "finishes %i-sentence prompts before the reading clock",
    (_count, text) => {
      expect(getQuestionPromptRevealMs(text)).toBe(revealMs(text))
    },
  )

  it("uses the card entrance fade for one sentence and the sentence fade after that", () => {
    expect(getQuestionSentenceFadeMs("Pick one")).toBe(950)
    expect(getQuestionSentenceFadeMs(TWO)).toBe(500)
  })

  it("changes visibility only at sentence-start boundaries", () => {
    const second = getQuestionSentenceStartElapsed(FOUR, 1)
    const third = getQuestionSentenceStartElapsed(FOUR, 2)
    const fourth = getQuestionSentenceStartElapsed(FOUR, 3)

    expect(getVisibleSentenceCount(FOUR, -1)).toBe(1)
    expect(getVisibleSentenceCount(FOUR, 0)).toBe(1)
    expect(getVisibleSentenceCount(FOUR, second - 1)).toBe(1)
    expect(getVisibleSentenceCount(FOUR, second)).toBe(2)
    expect(getVisibleSentenceCount(FOUR, third - 1)).toBe(2)
    expect(getVisibleSentenceCount(FOUR, third)).toBe(3)
    expect(getVisibleSentenceCount(FOUR, fourth - 1)).toBe(3)
    expect(getVisibleSentenceCount(FOUR, fourth)).toBe(4)
    expect(getVisibleSentenceCount("Pick one", 0)).toBe(1)
    expect(getVisibleSentenceCount("Pick one", 10_000)).toBe(1)
  })

  it("returns the next sentence threshold until the last fade can start", () => {
    expect(getNextSentenceRevealElapsed(FOUR, 0)).toBe(0)
    expect(getNextSentenceRevealElapsed(FOUR, 1)).toBe(
      getQuestionSentenceStartElapsed(FOUR, 1),
    )
    expect(getNextSentenceRevealElapsed(FOUR, 3)).toBe(
      getQuestionSentenceStartElapsed(FOUR, 3),
    )
    expect(getNextSentenceRevealElapsed(FOUR, 4)).toBeNull()
    expect(getNextSentenceRevealElapsed("Pick one", 1)).toBeNull()
  })
})
