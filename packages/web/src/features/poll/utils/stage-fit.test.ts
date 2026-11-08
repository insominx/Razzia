import {
  estimateStageHeight,
  mayNotFitStage,
} from "@razzia/web/features/poll/utils/stage-fit"
import {
  OPTION_CLASSES,
  OPTION_STAGE_PX,
  QUESTION_CLASSES,
  QUESTION_STAGE_PX,
} from "@razzia/web/features/poll/utils/type-tier"
import { describe, expect, it } from "vitest"

// Measured on the real host overlay in headless Chromium at 1920×1080: the
// bottom of the last option row plus the stage's bottom reserve. See
// `evidence/fit-calibration.md` in the task folder. Each `question` carries
// the case's name, as it did when measured.
const MEASURED = [
  {
    name: "two short options",
    question: "c2-short: Ready to move on?",
    options: ["Yes", "Not yet"],
    needed: 697,
  },
  {
    name: "three short options",
    question: "c3-short: Which topic next?",
    options: ["Splines", "Physics", "Networking"],
    needed: 848,
  },
  {
    name: "four medium options",
    question:
      "c4-medium: Which of these topics should we cover first this week?",
    options: [
      "Curves and splines",
      "Vehicle physics",
      "Netcode basics",
      "Git workflows",
    ],
    needed: 787,
  },
  {
    name: "five medium options",
    question:
      "c5-medium: Which of these topics should we cover first this week, given the project deadline?",
    options: [
      "Curves and splines for the road",
      "Vehicle physics and handling",
      "Netcode basics for the lobby",
      "Git workflows for the team",
      "Build and release pipeline",
    ],
    needed: 990,
  },
  {
    name: "six medium options",
    question:
      "c6-medium: Which of these topics should we cover first this week, given the project deadline and the midterm?",
    options: [
      "Curves and splines for the road",
      "Vehicle physics and handling",
      "Netcode basics for the lobby",
      "Git workflows for the team",
      "Build and release pipeline",
      "Something else entirely",
    ],
    needed: 990,
  },
  {
    name: "six long options",
    question:
      "c6-longopts: Which of these topics should we cover first this week, given the project deadline and the midterm?",
    options: [
      "Curves and splines for the road, including the tangent handles",
      "Vehicle physics and handling, including the suspension model",
      "Netcode basics for the lobby and the host migration",
      "Git workflows for the team, branching and review habits",
      "Build and release pipeline, including the CI checks",
      "Something else entirely: I will say in the Q&A at the end",
    ],
    needed: 1077,
  },
  {
    name: "an extreme poll",
    question:
      "Thinking about the project so far, which of the following problems would you most like us to spend the next two weeks solving together as a class, even if it means skipping something else?",
    options: [
      "Make the build faster so everyone can iterate quickly on their own machines",
      "Write a shared style guide and fix the inconsistencies across the whole codebase",
      "Add automated tests for the parts that keep breaking every single week",
      "Document how the networking layer works so new teammates can find their way",
      "Clean up the asset pipeline and remove the files nobody uses any more",
      "Something else: I will tell you in the Q&A at the end of the lecture",
    ],
    needed: 1259,
  },
]

describe("estimateStageHeight", () => {
  it.each(MEASURED)(
    "stays within 8% of what was measured for $name",
    ({ question, options, needed }) => {
      const estimate = estimateStageHeight({ question, options })

      expect(Math.abs(estimate - needed) / needed).toBeLessThan(0.08)
    },
  )

  it("grows with every option and with longer words", () => {
    const base = { question: "Which?", options: ["One", "Two"] }

    expect(
      estimateStageHeight({ ...base, options: [...base.options, "Three"] }),
    ).toBeGreaterThan(estimateStageHeight(base))
    expect(
      estimateStageHeight({
        ...base,
        question:
          "Which of these many things would you like to do first?".repeat(4),
      }),
    ).toBeGreaterThan(estimateStageHeight(base))
  })

  it("counts room for the voters' names in a named poll", () => {
    const base = { question: "Which?", options: ["One", "Two"] }

    expect(estimateStageHeight({ ...base, anonymous: false })).toBeGreaterThan(
      estimateStageHeight({ ...base, anonymous: true }),
    )
  })
})

describe("mayNotFitStage", () => {
  it("is quiet for a poll that fits, however it is set", () => {
    for (const { name, question, options } of MEASURED.slice(0, 6)) {
      expect(mayNotFitStage({ question, options }), name).toBe(false)
    }
  })

  it("warns about a poll that was measured not to fit", () => {
    const [extreme] = MEASURED.slice(6)

    expect(
      mayNotFitStage({ question: extreme.question, options: extreme.options }),
    ).toBe(true)
  })
})

describe("the pixel sizes the estimate uses", () => {
  const remOf = (classes: string) => {
    const match = /stage:text-\[([\d.]+)rem\]/u.exec(classes)

    return match ? Number(match[1]) : Number.NaN
  }

  it("equal the stage classes the layout really uses, at 1rem = 16 px", () => {
    for (const tier of ["short", "medium", "long"] as const) {
      expect(QUESTION_STAGE_PX[tier]).toBe(
        Math.round(remOf(QUESTION_CLASSES[tier]) * 16),
      )
      expect(OPTION_STAGE_PX[tier]).toBe(
        Math.round(remOf(OPTION_CLASSES[tier]) * 16),
      )
    }
  })
})
