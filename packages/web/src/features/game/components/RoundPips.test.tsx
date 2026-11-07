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
