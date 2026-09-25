import HudModule from "@razzia/web/features/game/components/HudModule"
import { ringDashOffset } from "@razzia/web/features/game/utils/timer-ring"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const HEIGHT_TOKEN = /(^|:)h-/u

const heightClasses = (element: Element) =>
  (element.getAttribute("class") ?? "")
    .split(" ")
    .filter((token) => HEIGHT_TOKEN.test(token))
    .sort()

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

  it("gives ring and boxed readouts the same value slot so labels align", () => {
    const { container } = render(
      <div>
        <HudModule
          label="TIME"
          value="17"
          role="info"
          countdown={{ remaining: 17, total: 20 }}
        />
        <HudModule label="RESPONSES" value="3 / 18" role="sequence" />
      </div>,
    )

    const slots = [...container.querySelectorAll("[data-hud-slot]")]
    const heights = slots.map(heightClasses)

    expect(slots).toHaveLength(2)
    expect(heights[0]).toEqual(["2xl:h-24", "h-14", "md:h-16"])
    expect(heights[1]).toEqual(heights[0])
  })
})
