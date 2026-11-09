import Prepared from "@razzia/web/features/game/components/states/Prepared"
import { useLaunchStore } from "@razzia/web/features/game/stores/launch"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { start } = vi.hoisted(() => ({ start: vi.fn() }))

// The score has its own tests; here a screen is judged by what it asks of it.
vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: { start },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const pips = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-pip]")].map((pip) =>
    pip.getAttribute("data-pip"),
  )

describe("Prepared round card", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useLaunchStore.setState({ armed: false })
    useManagerStore.getState().setVisuals({})
    useQuestionStore.getState().setQuestionStates({ current: 4, total: 6 })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("says which question this is out of how many, with a pip each", () => {
    const { container } = render(
      <Prepared data={{ questionNumber: 4, totalAnswers: 4 }} />,
    )

    expect(
      container.querySelector("[data-question-number-layout]")?.textContent,
    ).toBe('game:questionOf:{"number":4,"total":6}')
    expect(container.querySelector("[data-round-number]")?.textContent).toBe(
      "4",
    )
    expect(pips(container)).toEqual([
      "done",
      "done",
      "done",
      "now",
      "next",
      "next",
    ])
  })

  it("calls the last question the final one", () => {
    useQuestionStore.getState().setQuestionStates({ current: 6, total: 6 })

    const { container } = render(
      <Prepared data={{ questionNumber: 6, totalAnswers: 4 }} />,
    )

    expect(
      container.querySelector("[data-question-number-layout]")?.textContent,
    ).toBe("game:finalQuestion")
    expect(container.querySelector("[data-round-number]")).toHaveAttribute(
      "data-final",
    )
  })

  describe("in a lecture deck, which plays questions out of order", () => {
    const lecture = (played: number[], current: number) => {
      useManagerStore.getState().setLecture({
        inviteCode: "123456",
        total: 6,
        played,
        current,
        finished: false,
      })
    }

    afterEach(() => {
      useManagerStore.getState().setLecture(null)
    })

    it("marks the questions it really played, not the ones numbered lower", () => {
      lecture([3, 5], 5)
      useQuestionStore.getState().setQuestionStates({ current: 6, total: 6 })

      const { container } = render(
        <Prepared data={{ questionNumber: 6, totalAnswers: 4 }} />,
      )

      expect(pips(container)).toEqual([
        "next",
        "next",
        "next",
        "done",
        "next",
        "now",
      ])
      // The last slide's question, with four still to play, is not the final one.
      expect(
        container.querySelector("[data-question-number-layout]")?.textContent,
      ).toBe('game:questionOf:{"number":6,"total":6}')
      expect(
        container.querySelector("[data-round-number]"),
      ).not.toHaveAttribute("data-final")
    })

    it("calls the one left when every other has played the final one", () => {
      lecture([0, 1, 2, 3, 4, 5], 2)
      useQuestionStore.getState().setQuestionStates({ current: 3, total: 6 })

      const { container } = render(
        <Prepared data={{ questionNumber: 3, totalAnswers: 4 }} />,
      )

      expect(pips(container)).toEqual([
        "done",
        "done",
        "now",
        "done",
        "done",
        "done",
      ])
      expect(
        container.querySelector("[data-question-number-layout]")?.textContent,
      ).toBe("game:finalQuestion")
      expect(container.querySelector("[data-round-number]")).toHaveAttribute(
        "data-final",
      )
    })

    it("draws a phone's pips from the played questions the server sent", () => {
      // A phone has no lecture state; its question update says what was played.
      useQuestionStore
        .getState()
        .setQuestionStates({ current: 6, total: 6, played: [3, 5] })

      const { container } = render(
        <Prepared data={{ questionNumber: 6, totalAnswers: 4 }} />,
      )

      expect(pips(container)).toEqual([
        "next",
        "next",
        "next",
        "done",
        "next",
        "now",
      ])
      expect(
        container.querySelector("[data-round-number]"),
      ).not.toHaveAttribute("data-final")
    })

    it("does not count the question as played before the deck says so", () => {
      // The card can arrive before the deck's own update: the rest decide.
      lecture([0, 1, 3, 4, 5], 4)
      useQuestionStore.getState().setQuestionStates({ current: 3, total: 6 })

      const { container } = render(
        <Prepared data={{ questionNumber: 3, totalAnswers: 4 }} />,
      )

      expect(container.querySelector("[data-round-number]")).toHaveAttribute(
        "data-final",
      )
    })
  })

  it("keeps the plain number for a quiz whose length is not known", () => {
    useQuestionStore.getState().setQuestionStates(null)

    const { container } = render(
      <Prepared data={{ questionNumber: 4, totalAnswers: 4 }} />,
    )

    expect(
      container.querySelector("[data-question-number-layout]")?.textContent,
    ).toBe("game:questionPrefix4")
    expect(container.querySelector("[data-pip]")).toBeNull()
  })

  it("whooshes in on every card", () => {
    start.mockClear()

    render(<Prepared data={{ questionNumber: 2, totalAnswers: 4 }} />)

    expect(start.mock.calls).toEqual([[{ scene: "roundCard" }]])
  })

  it("flashes GO once, after the countdown, and clears it", () => {
    useLaunchStore.getState().arm()

    const { container } = render(
      <Prepared data={{ questionNumber: 1, totalAnswers: 4 }} />,
    )

    expect(container.querySelector("[data-go]")?.textContent).toBe("game:go")

    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(container.querySelector("[data-go]")).toBeNull()
  })

  it("flashes no GO for a card nobody counted down to", () => {
    const { container } = render(
      <Prepared data={{ questionNumber: 2, totalAnswers: 4 }} />,
    )

    expect(container.querySelector("[data-go]")).toBeNull()
  })

  it("keeps GO out of a calm show, but still uses it up", () => {
    useManagerStore.getState().setVisuals({ showIntensity: "calm" })
    useLaunchStore.getState().arm()

    const { container } = render(
      <Prepared data={{ questionNumber: 1, totalAnswers: 4 }} />,
    )

    expect(container.querySelector("[data-go]")).toBeNull()
    expect(useLaunchStore.getState().armed).toBe(false)
  })
})
