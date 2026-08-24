import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@razzia/web/assets/background.png", () => ({
  default: "/bundled-background.png",
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const getPhoto = (): HTMLImageElement => {
  const photo = screen.getByRole("presentation", { hidden: true })

  if (!(photo instanceof HTMLImageElement)) {
    throw new TypeError("Expected the photo atmosphere to render an image")
  }

  return photo
}

const getPhotoAtmosphere = (): HTMLDivElement => {
  const atmosphere = getPhoto().parentElement

  if (!(atmosphere instanceof HTMLDivElement)) {
    throw new TypeError("Expected the photo to be inside an atmosphere layer")
  }

  return atmosphere
}

const setPhotoDimensions = (photo: HTMLImageElement) => {
  Object.defineProperty(photo, "naturalWidth", { value: 32 })
  Object.defineProperty(photo, "naturalHeight", { value: 18 })
}

const mockCanvasLuminance = (value: number) => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (contextId: string) =>
      contextId === "2d"
        ? ({
            drawImage: () => undefined,
            getImageData: () => ({
              data: new Uint8ClampedArray(32 * 18 * 4).fill(value),
            }),
          } as unknown as CanvasRenderingContext2D)
        : null,
  )
}

describe("Atmosphere", () => {
  it("falls back to the bundled photo when the host image errors", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere"))
      .default
    const { container } = render(
      <Atmosphere recipe="photo" backgroundUrl="/broken.jpg" />,
    )

    const img = getPhoto()
    expect(img.getAttribute("src")).toBe("/broken.jpg")

    fireEvent.error(img)
    expect(img.getAttribute("src")).toBe("/bundled-background.png")
    expect(container.querySelector("[data-atmosphere-scrim]")).not.toBeNull()
  })

  it("uses viewport placement by default", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere"))
      .default
    render(<Atmosphere recipe="photo" />)

    expect(getPhotoAtmosphere()).toHaveClass("fixed")
    expect(getPhotoAtmosphere()).not.toHaveClass("absolute")
  })

  it("can stay inside a positioned container", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere"))
      .default
    render(<Atmosphere recipe="photo" placement="container" />)

    expect(getPhotoAtmosphere()).toHaveClass("absolute")
    expect(getPhotoAtmosphere()).not.toHaveClass("fixed")
  })

  it("uses a token-driven photo scrim instead of covering the image with canvas", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere"))
      .default
    const { container } = render(<Atmosphere recipe="photo" />)
    const scrim = container.querySelector("[data-atmosphere-scrim]")
    const img = getPhoto()

    expect(scrim).not.toBeNull()
    expect(scrim).not.toHaveClass("bg-canvas")
    expect(scrim?.getAttribute("class")).toContain(
      "[background:var(--rz-scrim)]",
    )
    expect(img).toHaveClass("object-contain")
  })

  it("drops the photo scrim after a dark image loads", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere"))
      .default
    const { container } = render(
      <Atmosphere recipe="photo" backgroundUrl="/dark.jpg" />,
    )
    const img = getPhoto()
    setPhotoDimensions(img)
    mockCanvasLuminance(20)
    fireEvent.load(img)

    expect(container.querySelector("[data-atmosphere-scrim]")).toBeNull()
    expect(img).toHaveClass("[filter:var(--rz-dark-photo-lift)]")
  })

  it("retains the scrim after a bright image loads", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere"))
      .default
    const { container } = render(
      <Atmosphere recipe="photo" backgroundUrl="/bright.jpg" />,
    )
    const img = getPhoto()
    setPhotoDimensions(img)
    mockCanvasLuminance(180)
    fireEvent.load(img)

    expect(container.querySelector("[data-atmosphere-scrim]")).not.toBeNull()
    expect(img).not.toHaveClass("[filter:var(--rz-dark-photo-lift)]")
  })

  it("retains the scrim when canvas luminance is unavailable", async () => {
    const Atmosphere = (await import("@razzia/web/components/Atmosphere"))
      .default
    const { container } = render(
      <Atmosphere recipe="photo" backgroundUrl="/unreadable.jpg" />,
    )
    const img = getPhoto()
    setPhotoDimensions(img)
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    fireEvent.load(img)

    expect(container.querySelector("[data-atmosphere-scrim]")).not.toBeNull()
    expect(img).not.toHaveClass("[filter:var(--rz-dark-photo-lift)]")
  })
})
