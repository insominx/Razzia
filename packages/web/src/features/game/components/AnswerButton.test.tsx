import { render } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, expectTypeOf, it } from "vitest"
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

describe("AnswerButton play surface", () => {
  it("derives locked, active, and default hover from one optional surface", () => {
    const { rerender, container } = render(
      <AnswerButton
        label="A"
        surface={{
          className: "border-answer-a bg-answer-a-tint",
          state: "locked",
        }}
      >
        First
      </AnswerButton>,
    )

    const lockedButton = container.querySelector("button")
    const lockedSurface = container.querySelector("[data-answer-surface]")

    expect(lockedButton).toHaveAttribute("data-hover-effect", "none")
    expect(lockedButton).not.toHaveClass("hover:-translate-y-0.5")
    expect(container.querySelector("[data-answer-hover-glow]")).toBeNull()
    expect(lockedSurface).toHaveAttribute("data-answer-surface-state", "locked")
    expect(lockedSurface).toHaveAttribute(
      "data-answer-surface-effect",
      "blurred",
    )

    rerender(
      <AnswerButton
        label="A"
        surface={{
          className: "border-answer-a bg-answer-a-tint",
          state: "active",
        }}
      >
        First
      </AnswerButton>,
    )

    const activeButton = container.querySelector("button")
    const activeSurface = container.querySelector("[data-answer-surface]")

    expect(activeButton).toHaveAttribute("data-hover-effect", "glow")
    expect(activeButton).not.toHaveClass("hover:-translate-y-0.5")
    expect(container.querySelector("[data-answer-hover-glow]")).not.toBeNull()
    expect(activeSurface).toHaveAttribute("data-answer-surface-state", "active")
    expect(activeSurface).toHaveAttribute("data-answer-surface-effect", "flash")

    rerender(<AnswerButton label="A">First</AnswerButton>)

    const defaultButton = container.querySelector("button")

    expect(defaultButton).toHaveAttribute("data-hover-effect", "lift")
    expect(defaultButton).toHaveClass("hover:-translate-y-0.5")
    expect(container.querySelector("[data-answer-hover-glow]")).toBeNull()
    expect(container.querySelector("[data-answer-surface]")).toBeNull()
  })

  it("types surface as an optional object with required className and state", () => {
    expectTypeOf<ComponentProps<typeof AnswerButton>["surface"]>().toEqualTypeOf<
      { className: string; state: "locked" | "active" } | undefined
    >()
  })
})
