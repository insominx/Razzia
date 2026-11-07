import FlapPin from "@razzia/web/features/game/components/FlapPin"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

describe("FlapPin", () => {
  afterEach(() => {
    cleanup()
  })

  it("reads as the PIN, once", () => {
    const { container } = render(<FlapPin code="426 426" />)

    expect(container.querySelector("[data-flap-pin]")).toHaveAttribute(
      "aria-label",
      "426 426",
    )
    // The cards are decoration over it.
    for (const card of container.querySelectorAll("[data-flap]")) {
      expect(card).toHaveAttribute("aria-hidden", "true")
    }
  })

  it("makes one card per character and a gap for the space", () => {
    const { container } = render(<FlapPin code="426 426" />)
    const cards = [...container.querySelectorAll("[data-flap]")]

    expect(cards.map((card) => card.textContent)).toEqual([
      "4",
      "2",
      "6",
      "4",
      "2",
      "6",
    ])
  })

  it("flips the cards in one after another", () => {
    const { container } = render(<FlapPin code="123456" />)
    const delays = [
      ...container.querySelectorAll<HTMLElement>("[data-flap]"),
    ].map((card) => Number.parseInt(card.style.animationDelay, 10))

    expect(delays).toEqual([...delays].sort((a, b) => a - b))
    expect(new Set(delays).size).toBe(6)
  })
})
