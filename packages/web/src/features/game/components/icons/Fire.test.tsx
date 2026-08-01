import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import Fire from "@razzia/web/features/game/components/icons/Fire"

describe("Fire icon", () => {
  it("does not use on-accent for the inner flame core", () => {
    const { container } = render(<Fire />)
    const fills = [...container.querySelectorAll("path")].map((p) =>
      p.getAttribute("fill"),
    )

    expect(fills).not.toContain("var(--rz-on-accent)")
    expect(fills.some((f) => f?.includes("warning") || f?.includes("#ffdf85"))).toBe(
      true,
    )
  })
})
