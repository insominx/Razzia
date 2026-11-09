import PollBars from "@razzia/web/features/poll/components/PollBars"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const rows = () => [...document.querySelectorAll("[data-poll-option]")]

const countOf = (row: Element) =>
  row.querySelector("[data-poll-count]")?.textContent

afterEach(() => {
  cleanup()
})

describe("PollBars", () => {
  it("shows each option with a letter, its count and its share", () => {
    render(
      <PollBars
        options={["Pizza", "Soup", "Salad"]}
        counts={[2, 1, 0]}
        total={3}
      />,
    )

    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("APizza"),
      expect.stringContaining("BSoup"),
      expect.stringContaining("CSalad"),
    ])
    expect(rows().map(countOf)).toEqual(["267%", "133%", "00%"])
  })

  it("sets four or more options in two columns on the stage, fewer in one", () => {
    const { rerender } = render(
      <PollBars options={["A1", "B1", "C1"]} counts={[0, 0, 0]} total={0} />,
    )

    expect(document.querySelector("ol")).toHaveAttribute("data-columns", "1")
    expect(document.querySelector("ol")?.className).not.toContain(
      "stage:grid-cols-2",
    )

    rerender(
      <PollBars
        options={["A1", "B1", "C1", "D1"]}
        counts={[0, 0, 0, 0]}
        total={0}
      />,
    )

    expect(document.querySelector("ol")).toHaveAttribute("data-columns", "2")
    expect(document.querySelector("ol")?.className).toContain(
      "stage:grid-cols-2",
    )
  })

  it("shows no share when nobody has voted", () => {
    render(<PollBars options={["Yes", "No"]} counts={[0, 0]} total={0} />)

    expect(rows().map(countOf)).toEqual(["00%", "00%"])
  })

  it("marks the option this player picked, and only that one", () => {
    render(
      <PollBars options={["Yes", "No"]} counts={[1, 0]} total={1} mine={1} />,
    )

    expect(rows().map((row) => row.hasAttribute("data-mine"))).toEqual([
      false,
      true,
    ])
    expect(rows()[1].textContent).toContain("poll:yourVote")
    expect(rows()[0].textContent).not.toContain("poll:yourVote")
  })

  it("lists who voted for each option, a few names and then a count", () => {
    const voters = Array.from({ length: 10 }, (_, i) => ({
      username: `Student ${i}`,
      option: 0,
    }))

    render(
      <PollBars
        options={["Yes", "No"]}
        counts={[10, 0]}
        total={10}
        voters={voters}
      />,
    )

    const names = [...document.querySelectorAll("[data-poll-names]")]

    expect(names).toHaveLength(1)
    expect(names[0].textContent).toContain("Student 0, Student 1")
    expect(names[0].textContent).toContain("Student 7")
    expect(names[0].textContent).not.toContain("Student 8")
    expect(names[0].textContent).toContain('poll:more:{"count":2}')
  })

  it("lists as many names as the caller allows, and counts the rest", () => {
    const voters = Array.from({ length: 10 }, (_, i) => ({
      username: `Student ${i}`,
      option: 0,
    }))
    const bars = (namesLimit: number) => (
      <PollBars
        options={["Yes", "No"]}
        counts={[10, 0]}
        total={10}
        voters={voters}
        namesLimit={namesLimit}
      />
    )

    const { rerender } = render(bars(3))
    const text = () => document.querySelector("[data-poll-names]")?.textContent

    expect(text()).toContain("Student 2")
    expect(text()).not.toContain("Student 3")
    expect(text()).toContain('poll:more:{"count":7}')

    rerender(bars(Number.POSITIVE_INFINITY))

    expect(text()).toContain("Student 0")
    expect(text()).toContain("Student 9")
    expect(text()).not.toContain("poll:more")
  })

  it("shows no names for a poll without voters", () => {
    render(<PollBars options={["Yes", "No"]} counts={[1, 0]} total={1} />)

    expect(document.querySelector("[data-poll-names]")).toBeNull()
  })

  it("copes with counts that are missing for an option", () => {
    render(<PollBars options={["Yes", "No"]} counts={[1]} total={1} />)

    expect(rows().map(countOf)).toEqual(["1100%", "00%"])
  })
})
