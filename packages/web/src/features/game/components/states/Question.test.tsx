import { render } from "@testing-library/react"
import { QUESTION_CONTENT_ENTER_MS } from "@razzia/common/utils/question-transition"
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

describe("Question shared layout", () => {
  it("renders the prompt as the source of the question-to-answers morph", () => {
    const { container } = render(
      <Question
        data={{
          question: "Which boundary owns this state?",
          questionNumber: 7,
          cooldown: 5,
          media: { type: "image", url: "/question.png" },
        }}
      />,
    )

    const card = container.querySelector(
      '[data-question-layout="game-question"]',
    )
    expect(card).toHaveClass(
      "max-w-4xl",
      "px-6",
      "py-8",
      "md:px-10",
      "md:py-10",
    )
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
    expect(
      container.querySelector("[style*='progressBar 5s linear 950ms both']"),
    ).toBeTruthy()
  })
})
