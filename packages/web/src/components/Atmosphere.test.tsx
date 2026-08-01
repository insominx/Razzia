import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@razzia/web/assets/background.png", () => ({
  default: "/bundled-background.png",
}))

describe("Atmosphere", () => {
  it("falls back to the bundled photo when the host image errors", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere")).default
    render(<Atmosphere recipe="photo" backgroundUrl="/broken.jpg" />)

    const img = screen.getByRole("presentation", { hidden: true }) as HTMLImageElement
    expect(img.getAttribute("src")).toBe("/broken.jpg")

    fireEvent.error(img)
    expect(img.getAttribute("src")).toBe("/bundled-background.png")
  })
})
