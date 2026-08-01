import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@razzia/web/assets/background.png", () => ({
  default: "/bundled-background.png",
}))

describe("Atmosphere", () => {
  it("anchors ambient recipe with inset-0 and z-0 stack owner", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere")).default
    const { container } = render(<Atmosphere recipe="ambient" />)
    const root = container.firstElementChild as HTMLElement

    expect(root.className).toContain("absolute")
    expect(root.className).toContain("inset-0")
    expect(root.className).toContain("z-0")
    expect(root.className).toContain("rounded-rz-xl")
  })

  it("keeps photo recipe under content with z-0 and falls back on image error", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere")).default
    render(<Atmosphere recipe="photo" backgroundUrl="/broken.jpg" />)

    const img = screen.getByRole("presentation", { hidden: true }) as HTMLImageElement
    expect(img.getAttribute("src")).toBe("/broken.jpg")

    const root = img.parentElement as HTMLElement
    expect(root.className).toContain("fixed")
    expect(root.className).toContain("inset-0")
    expect(root.className).toContain("z-0")

    fireEvent.error(img)
    expect(img.getAttribute("src")).toBe("/bundled-background.png")
  })
})
