import ChargeLine from "@razzia/web/features/game/components/ChargeLine"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

const line = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-line]")

describe("ChargeLine", () => {
  afterEach(cleanup)

  it("is decoration: hidden from assistive tech", () => {
    const { container } = render(<ChargeLine mode="idle" />)

    expect(line(container)).toHaveAttribute("aria-hidden", "true")
    expect(line(container)).toHaveAttribute("data-line", "idle")
  })

  it("grows across a segment, starting when told", () => {
    const { container } = render(
      <ChargeLine
        mode="grow"
        segment={{ from: 0.25, to: 1, durationMs: 12_000 }}
        delayMs={-3_000}
      />,
    )
    const style = line(container)?.style

    expect(line(container)).toHaveAttribute("data-line", "grow")
    expect(style?.getPropertyValue("--rz-line-from")).toBe("0.25")
    expect(style?.getPropertyValue("--rz-line-to")).toBe("1")
    expect(style?.getPropertyValue("--rz-line-dur")).toBe("12000ms")
    // A negative delay means the screen arrived this far in.
    expect(style?.getPropertyValue("--rz-line-delay")).toBe("-3000ms")
  })

  it("burns for the whole answering window, partway through for a late arrival", () => {
    const { container } = render(
      <ChargeLine mode="burn" answerSeconds={20} elapsedMs={4_000} />,
    )
    const style = line(container)?.style

    expect(line(container)).toHaveAttribute("data-line", "burn")
    expect(style?.getPropertyValue("--rz-line-dur")).toBe("20000ms")
    expect(style?.getPropertyValue("--rz-line-delay")).toBe("-4000ms")
  })

  it("turns hot five seconds before the end, less however far in it is", () => {
    const fresh = render(
      <ChargeLine mode="burn" answerSeconds={20} elapsedMs={0} />,
    )
    expect(
      line(fresh.container)?.style.getPropertyValue("--rz-line-heat-delay"),
    ).toBe("15000ms")
    cleanup()

    const late = render(
      <ChargeLine mode="burn" answerSeconds={20} elapsedMs={4_000} />,
    )
    expect(
      line(late.container)?.style.getPropertyValue("--rz-line-heat-delay"),
    ).toBe("11000ms")
  })

  it("is simply lit when there is no time limit to burn down", () => {
    const { container } = render(<ChargeLine mode="lit" />)

    expect(line(container)).toHaveAttribute("data-line", "lit")
    expect(line(container)?.style.getPropertyValue("--rz-line-dur")).toBe("")
  })
})
