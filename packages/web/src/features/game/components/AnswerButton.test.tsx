import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"

describe("AnswerButton scoring icons", () => {
  it("colors correct/incorrect icons with success/danger tokens", () => {
    const { rerender, container } = render(
      <AnswerButton label="A" correct>
        Yes
      </AnswerButton>,
    )

    expect(container.querySelector("svg")?.getAttribute("class")).toContain(
      "text-success",
    )

    rerender(
      <AnswerButton label="A" correct={false}>
        No
      </AnswerButton>,
    )

    expect(container.querySelector("svg")?.getAttribute("class")).toContain(
      "text-danger",
    )
  })
})

describe("AnswerButton wrap policy", () => {
  it("uses word-boundary wrap classes and keeps scoring icons from shrinking", () => {
    const { rerender, container } = render(
      <AnswerButton label="A">
        https://example.com/this-is-a-very-long-unbreakable-token-path
      </AnswerButton>,
    )

    const paragraphClass = container.querySelector("p")?.getAttribute("class")
    expect(paragraphClass).toContain("min-w-0")
    expect(paragraphClass).toContain("wrap-break-word")
    expect(paragraphClass).not.toContain("break-all")

    rerender(
      <AnswerButton label="A" correct>
        https://example.com/this-is-a-very-long-unbreakable-token-path
      </AnswerButton>,
    )

    const iconClass = container.querySelector("svg")?.getAttribute("class")
    expect(iconClass).toContain("shrink-0")
    expect(iconClass).toContain("size-4")
    expect(iconClass).toContain("md:size-6")
  })
})
