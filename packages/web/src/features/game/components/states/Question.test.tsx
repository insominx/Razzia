import { act, cleanup, render } from "@testing-library/react"
import {
  getQuestionPromptRevealMs,
  QUESTION_CONTENT_ENTER_MS,
} from "@razzia/common/utils/question-transition"
import { describe, expect, it, vi } from "vitest"
import type { SceneOptions, SceneSpec } from "@razzia/web/features/game/audio"
import { anchorOf, originMs } from "@razzia/web/features/game/audio/scenes"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import {
  QUESTION_LAYOUT_MODE,
  QUESTION_LAYOUT_TRANSITION_MS,
} from "@razzia/web/features/game/components/QuestionCard"
import Question from "@razzia/web/features/game/components/states/Question"

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
}))

// The score has its own tests; here a screen is judged by what it asks of it.
vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: { start: mocks.start },
}))

const MULTI =
  "A door is opened during the game. Players joining later should see that it is already open. How should its open/closed state normally be synchronized?"

describe("Question score", () => {
  it("asks for the reading scene, charging when the prompt has been read", () => {
    mocks.start.mockClear()

    render(
      <Question
        data={{
          question: "Which boundary owns this state?",
          questionNumber: 1,
          cooldown: 5,
          promptStartedAt: 1_000,
          serverNow: 1_200,
        }}
      />,
    )

    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.start).toHaveBeenCalledWith(
      {
        scene: "reading",
        chargeAt:
          1_000 + getQuestionPromptRevealMs("Which boundary owns this state?"),
        chargeMs: 5_000,
        serverNow: 1_200,
      },
      { silent: false },
    )
  })

  it("keeps the charge in the past when a review over the hidden screen ends", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"))
    mocks.start.mockClear()

    const data = {
      question: "Which boundary owns this state?",
      questionNumber: 1,
      cooldown: 5,
      promptStartedAt: 1_000,
      serverNow: 1_200,
    }
    const arrivedAt = Date.now()

    try {
      render(<Question data={data} />)

      act(() => useManagerStore.getState().setReview(0))
      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      act(() => useManagerStore.getState().setReview(null))

      const [spec, options] = mocks.start.mock.calls.at(-1) as [
        SceneSpec,
        SceneOptions,
      ]

      expect(options).toMatchObject({ silent: false })
      expect(
        originMs(anchorOf(spec) ?? null, Date.now(), options.offsetMs),
      ).toBe(
        arrivedAt +
          1_000 +
          getQuestionPromptRevealMs(data.question) -
          data.serverNow,
      )
    } finally {
      cleanup()
      useManagerStore.getState().reset()
      vi.useRealTimers()
    }
  })
})

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
    expect(card).toHaveClass("w-full", "px-1", "py-3", "stage:p-0")
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
    // The reading clock is the line: it starts charging when the one
    // sentence has finished fading in, and takes the whole cooldown.
    const line = container.querySelector<HTMLElement>("[data-line='grow']")
    expect(line?.style.getPropertyValue("--rz-line-delay")).toBe("950ms")
    expect(line?.style.getPropertyValue("--rz-line-dur")).toBe("5000ms")
    expect(line?.style.getPropertyValue("--rz-line-from")).toBe("0")
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
      container
        .querySelector<HTMLElement>("[data-line='grow']")
        ?.style.getPropertyValue("--rz-line-delay"),
    ).toBe(`${delay}ms`)
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
    // The rows stay on their own lines as context, and the question itself is
    // the ask, set bigger on its own line. Runs of blank lines collapse.
    const [lead, ask] = [...(sentence?.children ?? [])]
    expect(lead.textContent).toBe(
      "The distance table contains these two rows:\nu = 0.4, distance = 2 m\nu = 0.8, distance = 6 m",
    )
    expect(ask.textContent).toBe("Which u should we use at distance = 4 m?")
    expect(getQuestionPromptRevealMs(question)).toBe(QUESTION_CONTENT_ENTER_MS)
  })
})
