import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@razzia/web/assets/background.png", () => ({
  default: "/bundled-background.png",
}))

describe("Atmosphere", () => {
  it("falls back to the bundled photo when the host image errors", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere"))
      .default
    render(<Atmosphere recipe="photo" backgroundUrl="/broken.jpg" />)

    const img = screen.getByRole("presentation", { hidden: true })
    expect(img.getAttribute("src")).toBe("/broken.jpg")

    fireEvent.error(img)
    expect(img.getAttribute("src")).toBe("/bundled-background.png")
  })

  it("uses a token-driven photo scrim instead of covering the image with canvas", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere"))
      .default
    const { container } = render(<Atmosphere recipe="photo" />)
    const scrim = container.querySelector("[data-atmosphere-scrim]")
    const img = container.querySelector("img")

    expect(scrim).not.toBeNull()
    expect(scrim).not.toHaveClass("bg-canvas")
    expect(scrim?.getAttribute("class")).toContain("[background:var(--rz-scrim)]")
    expect(img).toHaveClass("object-contain")
  })

  it("drops the photo scrim after a dark image loads", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere"))
      .default
    const { container } = render(
      <Atmosphere recipe="photo" backgroundUrl="/dark.jpg" />,
    )
    const img = container.querySelector("img")
    Object.defineProperty(img, "naturalWidth", { value: 32 })
    Object.defineProperty(img, "naturalHeight", { value: 18 })
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = () =>
      ({
        drawImage: () => undefined,
        getImageData: () => ({
          data: new Uint8ClampedArray(32 * 18 * 4).fill(20),
        }),
      }) as unknown as CanvasRenderingContext2D
    fireEvent.load(img!)
    HTMLCanvasElement.prototype.getContext = original

    expect(container.querySelector("[data-atmosphere-scrim]")).toBeNull()
    expect(img).toHaveClass("[filter:var(--rz-dark-photo-lift)]")
  })
})
