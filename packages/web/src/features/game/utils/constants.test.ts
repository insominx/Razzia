import {
  ANSWER_BAR,
  ANSWER_IDENTITY,
  ANSWER_INK,
  ANSWERS_LABELS,
  SFX,
  getManagerSkipEvent,
  sfxForTheme,
} from "@razzia/web/features/game/utils/constants"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { describe, expect, it } from "vitest"

const CLASSIC_CUES = [
  SFX.ANSWERS.MUSIC,
  SFX.ANSWERS.SOUND,
  SFX.BOUMP_SOUND,
  SFX.SHOW_SOUND,
  SFX.RESULTS_SOUND,
  SFX.PODIUM.THREE,
  SFX.PODIUM.SECOND,
  SFX.PODIUM.SNEAR_ROOL,
  SFX.PODIUM.FIRST,
]

describe("sfxForTheme", () => {
  it("keeps every cue classic for undefined and classic", () => {
    for (const cue of CLASSIC_CUES) {
      expect(sfxForTheme(undefined, cue)).toBe(cue)
      expect(sfxForTheme("classic", cue)).toBe(cue)
    }
  })

  it("maps all nine cues under the techno pack", () => {
    expect(CLASSIC_CUES.map((cue) => sfxForTheme("techno", cue))).toEqual([
      "/sounds/themes/techno/answersMusic.mp3",
      "/sounds/themes/techno/answersSound.mp3",
      "/sounds/themes/techno/boump.mp3",
      "/sounds/themes/techno/show.mp3",
      "/sounds/themes/techno/results.mp3",
      "/sounds/themes/techno/three.mp3",
      "/sounds/themes/techno/second.mp3",
      "/sounds/themes/techno/snearRoll.mp3",
      "/sounds/themes/techno/first.mp3",
    ])
  })

  it("falls back to classic for a cue the pack does not ship", () => {
    expect(sfxForTheme("techno", "/sounds/notInThePack.mp3")).toBe(
      "/sounds/notInThePack.mp3",
    )
  })
})

describe("getManagerSkipEvent", () => {
  const answerData = {
    question: "Question",
    questionNumber: 1,
    answers: ["A", "B"],
    time: 10,
    totalPlayer: 2,
    revealStartedAt: 1_000,
    unlockAt: 5_000,
    serverNow: 1_000,
    answeringOpen: false,
  }

  it("uses distinct reveal and answering commands for the same status", () => {
    expect(
      getManagerSkipEvent({ name: STATUS.SELECT_ANSWER, data: answerData }),
    ).toBe(EVENTS.MANAGER.UNLOCK_ANSWERS)
    expect(
      getManagerSkipEvent({
        name: STATUS.SELECT_ANSWER,
        data: { ...answerData, answeringOpen: true },
      }),
    ).toBe(EVENTS.MANAGER.ABORT_QUIZ)
  })

  it("preserves existing manager navigation and closed statuses", () => {
    expect(
      getManagerSkipEvent({
        name: STATUS.SHOW_ROOM,
        data: { text: "Waiting" },
      }),
    ).toBe(EVENTS.MANAGER.START_GAME)
    expect(
      getManagerSkipEvent({
        name: STATUS.SHOW_QUESTION,
        data: {
          question: "Question",
          questionNumber: 1,
          cooldown: 5,
          promptStartedAt: 0,
          serverNow: 0,
        },
      }),
    ).toBeNull()
  })
})

const MEANING_ROLE =
  /(?:bg|text|border)-(?:brand|success|danger|info|warning|sequence)(?![\w-])/
const RAW_LITERAL = /#[0-9a-f]{3,8}|(?:bg|text|border)-(?:white|black|gray-)/i

describe("answer recipes", () => {
  it("covers every answer slot", () => {
    expect(ANSWER_IDENTITY).toHaveLength(4)
    expect(ANSWER_BAR).toHaveLength(4)
    expect(ANSWER_INK).toHaveLength(4)
    expect(ANSWERS_LABELS).toHaveLength(4)
  })

  it("draws the tile as an accent stroke over a tint, inked per slot", () => {
    ANSWER_IDENTITY.forEach((recipe, index) => {
      const slot = ANSWERS_LABELS[index].toLowerCase()

      expect(recipe).toContain(`border-answer-${slot}`)
      expect(recipe).toContain(`bg-answer-${slot}-tint`)
      expect(recipe).toContain(`text-answer-${slot}-ink`)
    })
  })

  it("gives the response bars a solid fill so length still reads", () => {
    ANSWER_BAR.forEach((recipe, index) => {
      const slot = ANSWERS_LABELS[index].toLowerCase()

      expect(recipe).toBe(`bg-answer-${slot}`)
    })
  })

  // The chart's letter, percentage and count sit beside the bar, so the slot
  // has to survive on type alone — no stroke or fill to lean on.
  it("inks the marks beside the bar without a fill or a stroke", () => {
    ANSWER_INK.forEach((recipe, index) => {
      const slot = ANSWERS_LABELS[index].toLowerCase()

      expect(recipe).toBe(`text-answer-${slot}-ink`)
    })
  })

  it("never encodes identity with a meaning role", () => {
    for (const recipe of [...ANSWER_IDENTITY, ...ANSWER_BAR, ...ANSWER_INK]) {
      expect(recipe).not.toMatch(MEANING_ROLE)
    }
  })

  it("resolves every colour through a role, never a literal", () => {
    for (const recipe of [...ANSWER_IDENTITY, ...ANSWER_BAR, ...ANSWER_INK]) {
      expect(recipe).not.toMatch(RAW_LITERAL)
    }
  })
})
