import HudModule from "@razzia/web/features/game/components/HudModule"
import { ringDashOffset } from "@razzia/web/features/game/utils/timer-ring"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

describe("HudModule", () => {
  it("renders a plain boxed readout without a ring", () => {
    const { container } = render(
      <HudModule label="RESPONSES" value="3 / 18" role="sequence" />,
    )

    expect(screen.getByText("RESPONSES")).toBeTruthy()
    expect(screen.getByText("3 / 18")).toBeTruthy()
    expect(container.querySelector("svg")).toBeNull()
  })

  it("centers the countdown value inside the ring instead of covering it", () => {
    const { container } = render(
      <HudModule
        label="TIME"
        value="17"
        role="info"
        countdown={{ remaining: 17, total: 20 }}
      />,
    )

    const svg = container.querySelector("svg")
    const svgClass = svg?.getAttribute("class") ?? ""

    expect(screen.getByText("17")).toBeTruthy()
    expect(svgClass).toContain("inset-0")
    expect(svgClass).not.toContain("-right-5")
    expect(svgClass).not.toContain("z-0")

    const progress = container.querySelector(".rz-timer-ring")
    expect(progress?.getAttribute("stroke-dashoffset")).toBe(
      String(ringDashOffset(17, 20)),
    )
  })
})
