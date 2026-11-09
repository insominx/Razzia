import Odometer from "@razzia/web/features/game/components/Odometer"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

const strips = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>(".rz-odo-strip")].map(
    (strip) => strip.style.transform,
  )

describe("Odometer", () => {
  afterEach(() => {
    cleanup()
  })

  it("reads as the number, with thousands separated", () => {
    const { container } = render(<Odometer value={12_340} />)

    expect(container.querySelector(".sr-only")?.textContent).toBe("12,340")
  })

  it("sets each digit's column to its place in 0-9", () => {
    const { container } = render(<Odometer value={407} />)

    expect(strips(container)).toEqual([
      "translateY(-40%)",
      "translateY(0%)",
      "translateY(-70%)",
    ])
  })

  it("rolls from the old digits to the new ones in place", () => {
    const { container, rerender } = render(<Odometer value={407} />)
    const before = [...container.querySelectorAll(".rz-odo-strip")]

    rerender(<Odometer value={918} />)

    const after = [...container.querySelectorAll(".rz-odo-strip")]

    // The same columns, moved: that is what lets the transition run.
    expect(after).toEqual(before)
    expect(strips(container)).toEqual([
      "translateY(-90%)",
      "translateY(-10%)",
      "translateY(-80%)",
    ])
  })

  it("rolls the lowest digits the longest", () => {
    const { container } = render(<Odometer value={1_234} durationMs={1_000} />)
    const durations = [
      ...container.querySelectorAll<HTMLElement>(".rz-odo-strip"),
    ].map((strip) => Number.parseInt(strip.style.transitionDuration, 10))

    expect(durations).toEqual([1_270, 1_180, 1_090, 1_000])
  })

  it("snaps when asked not to roll", () => {
    const { container } = render(<Odometer value={55} roll={false} />)

    for (const strip of container.querySelectorAll<HTMLElement>(
      ".rz-odo-strip",
    )) {
      expect(strip.style.transitionDuration).toBe("0ms")
    }
  })

  it("never shows a negative or fractional score", () => {
    const { container } = render(<Odometer value={-3.4} />)

    expect(container.querySelector(".sr-only")?.textContent).toBe("0")
  })
})
