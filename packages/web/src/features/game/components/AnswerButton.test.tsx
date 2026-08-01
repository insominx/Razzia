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
