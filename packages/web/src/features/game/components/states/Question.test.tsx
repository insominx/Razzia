import { render } from "@testing-library/react"
import {
  getQuestionPromptRevealMs,
  QUESTION_CONTENT_ENTER_MS,
} from "@razzia/common/utils/question-transition"
import { describe, expect, it, vi } from "vitest"
import {
  QUESTION_LAYOUT_MODE,
  QUESTION_LAYOUT_TRANSITION_MS,
} from "@razzia/web/features/game/components/QuestionCard"
import Question from "@razzia/web/features/game/components/states/Question"

const mocks = vi.hoisted(() => ({
  show: vi.fn(),
}))

vi.mock("@razzia/web/features/game/hooks/use-sfx", () => ({
  useSfx: () => (path: string) => path,
}))

vi.mock("use-sound", () => ({
  default: () => [mocks.show],
}))

const MULTI =
  "A door is opened during the game. Players joining later should see that it is already open. How should its open/closed state normally be synchronized?"

describe("Question shared layout", () => {
  it("renders the prompt as the source of the question-to-answers morph", () => {
    const { container } = render(
      <Question
        data={{
          question: "Which boundary owns this state?",
          questionNumber: 7,
          cooldown: 5,
          promptStartedAt: 0,
          serverNow: 0,
          media: { type: "image", url: "/question.png" },
        }}
      />,
    )

    const card = container.querySelector(
      '[data-question-layout="game-question"]',
    )
    expect(card).toHaveClass("w-full", "px-6", "py-8", "md:px-10", "md:py-10")
    expect(card).not.toHaveClass("max-w-4xl")
    expect(card?.parentElement).toHaveClass("w-full")
    expect(card).not.toHaveClass("bg-panel/40", "border")
    expect(card).toHaveAttribute("data-question-entrance", "fade")
    expect(
      container.querySelector(
        '[data-question-number-layout="game-question-number"]',
      ),
    ).toHaveAttribute("data-question-number-phase", "settled")
    expect(QUESTION_LAYOUT_MODE).toBe("position")
    expect(QUESTION_LAYOUT_TRANSITION_MS).toBe(950)
    expect(QUESTION_CONTENT_ENTER_MS).toBe(950)
    expect(container.querySelectorAll("[data-question-sentence]")).toHaveLength(
      1,
    )
    expect(
      container.querySelector('[data-question-sentence-state="visible"]'),
    ).toBeTruthy()
    expect(
      container.querySelector("[style*='progressBar 5s linear 950ms both']"),
    ).toBeTruthy()
  })

  it("holds the reading bar until the last sentence has faded in", () => {
    const { container } = render(
      <Question
        data={{
          question: MULTI,
          questionNumber: 7,
          cooldown: 5,
          promptStartedAt: 0,
          serverNow: 0,
        }}
      />,
    )

    const delay = getQuestionPromptRevealMs(MULTI)
    expect(container.querySelectorAll("[data-question-sentence]")).toHaveLength(
      3,
    )
    expect(
      container.querySelectorAll('[data-question-sentence-state="visible"]'),
    ).toHaveLength(1)
    expect(
      container.querySelectorAll('[data-question-sentence-state="reserved"]'),
    ).toHaveLength(2)
    expect(
      container.querySelector(
        `[style*='progressBar 5s linear ${delay}ms both']`,
      ),
    ).toBeTruthy()
  })

  it("keeps a distance table on its own lines without adding sentences", () => {
    const question =
      "The distance table contains these two rows:\n\nu = 0.4, distance = 2 m\nu = 0.8, distance = 6 m\n\nWhich u should we use at distance = 4 m?"
    const { container } = render(
      <Question
        data={{
          question,
          questionNumber: 5,
          cooldown: 5,
          promptStartedAt: 0,
          serverNow: 0,
        }}
      />,
    )

    const sentence = container.querySelector("[data-question-sentence]")
    expect(container.querySelectorAll("[data-question-sentence]")).toHaveLength(
      1,
    )
    expect(sentence).toHaveClass("whitespace-pre-line")
    expect(sentence?.textContent).toBe(question)
    expect(getQuestionPromptRevealMs(question)).toBe(QUESTION_CONTENT_ENTER_MS)
  })
})
