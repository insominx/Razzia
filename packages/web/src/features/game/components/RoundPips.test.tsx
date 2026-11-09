import RoundPips, {
  MAX_PIPS,
} from "@razzia/web/features/game/components/RoundPips"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

const states = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-pip]")].map((pip) =>
    pip.getAttribute("data-pip"),
  )

describe("RoundPips", () => {
  afterEach(() => {
    cleanup()
  })

  it("marks finished, current and coming questions", () => {
    const { container } = render(<RoundPips current={3} total={5} />)

    expect(states(container)).toEqual(["done", "done", "now", "next", "next"])
  })

  it("lights every pip but the last on the way to the final question", () => {
    const { container } = render(<RoundPips current={5} total={5} />)

    expect(states(container)).toEqual(["done", "done", "done", "done", "now"])
  })

  it("marks only the questions played when they did not play in order", () => {
    const { container } = render(
      <RoundPips current={2} total={5} done={[4, 5]} />,
    )

    expect(states(container)).toEqual(["next", "now", "next", "done", "done"])
  })

  it("fills a long deck's bar by the questions played, not the number", () => {
    const { container } = render(
      <RoundPips current={50} total={MAX_PIPS * 4 + 6} done={[3, 9]} />,
    )

    expect(
      container.querySelector<HTMLElement>("[data-round-progress] > div")?.style
        .width,
    ).toBe(`${(3 / (MAX_PIPS * 4 + 6)) * 100}%`)
  })

  it("is read as a position, not as a row of dots", () => {
    const { container } = render(<RoundPips current={2} total={6} />)

    expect(container.firstElementChild).toHaveAttribute("aria-label", "2 / 6")
  })

  it("draws a bar for a deck too long for pips", () => {
    const { container } = render(
      <RoundPips current={27} total={MAX_PIPS * 4 + 6} />,
    )

    expect(container.querySelector("[data-pip]")).toBeNull()
    expect(container.querySelector("[data-round-progress]")).not.toBeNull()
  })
})
