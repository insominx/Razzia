import Atmosphere from "@razzia/web/components/Atmosphere"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

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

const activeMoods = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-mood][data-on]")].map(
    (layer) => (layer as HTMLElement).dataset.mood,
  )

describe("Atmosphere backdrop", () => {
  it("is made in code: no photo is downloaded by default", () => {
    const { container } = render(<Atmosphere recipe="photo" />)

    expect(screen.queryByRole("presentation", { hidden: true })).toBeNull()
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector(".rz-backdrop")).not.toBeNull()
  })

  it("uses viewport placement by default and can stay inside a container", () => {
    const { container, rerender } = render(<Atmosphere recipe="photo" />)

    expect(container.firstElementChild).toHaveClass("fixed")
    expect(container.firstElementChild).not.toHaveClass("absolute")

    rerender(<Atmosphere recipe="photo" placement="container" />)

    expect(container.firstElementChild).toHaveClass("absolute")
    expect(container.firstElementChild).not.toHaveClass("fixed")
  })

  it("is hidden from assistive tech and never takes a click", () => {
    const { container } = render(<Atmosphere recipe="photo" />)

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true")
    expect(container.firstElementChild).toHaveClass("pointer-events-none")
  })
})

describe("Atmosphere room light", () => {
  it("has none unless asked, and rises with the share it is given", () => {
    const { container, rerender } = render(<Atmosphere recipe="photo" />)

    expect(container.querySelector("[data-lift]")).toBeNull()

    rerender(<Atmosphere recipe="photo" lift={0.5} />)

    expect(
      container
        .querySelector<HTMLElement>("[data-lift]")
        ?.style.getPropertyValue("--rz-lift"),
    ).toBe("0.5")
  })

  it("breathes once per heartbeat, but not when calm", () => {
    const { container, rerender } = render(
      <Atmosphere recipe="photo" lift={0.5} breath={0} />,
    )

    expect(container.querySelector(".rz-breath")).toBeNull()

    rerender(<Atmosphere recipe="photo" lift={0.5} breath={1} />)
    expect(container.querySelectorAll(".rz-breath")).toHaveLength(1)

    rerender(<Atmosphere recipe="photo" lift={0.5} breath={2} calm />)
    expect(container.querySelector(".rz-breath")).toBeNull()
  })
})

describe("Atmosphere mood", () => {
  it("rests on the cool mood", () => {
    const { container } = render(<Atmosphere recipe="photo" />)

    expect(activeMoods(container)).toEqual(["cool"])
  })

  it("lights one mood at a time, with every mood present to crossfade", () => {
    const { container, rerender } = render(
      <Atmosphere recipe="photo" mood="teal" />,
    )

    expect(container.querySelectorAll("[data-mood]")).toHaveLength(5)
    expect(activeMoods(container)).toEqual(["teal"])

    rerender(<Atmosphere recipe="photo" mood="warm" />)

    expect(activeMoods(container)).toEqual(["warm"])
  })

  it("opens and closes the show with beams, and only in the full show", () => {
    const beamsOn = (container: HTMLElement) =>
      container.querySelectorAll(".rz-beam[data-on]").length

    const cool = render(<Atmosphere recipe="photo" mood="cool" />)
    expect(beamsOn(cool.container)).toBe(0)
    cleanup()

    const teal = render(<Atmosphere recipe="photo" mood="teal" />)
    expect(beamsOn(teal.container)).toBe(2)
    cleanup()

    const gold = render(<Atmosphere recipe="photo" mood="gold" />)
    expect(beamsOn(gold.container)).toBe(2)
    cleanup()

    const calm = render(<Atmosphere recipe="photo" mood="gold" calm />)
    expect(beamsOn(calm.container)).toBe(0)
  })

  it("sends up embers while the room runs warm, unless it is calm", () => {
    const warm = render(<Atmosphere recipe="photo" mood="warm" />)
    expect(warm.container.querySelectorAll(".rz-ember")).toHaveLength(12)
    cleanup()

    const cool = render(<Atmosphere recipe="photo" mood="cool" />)
    expect(cool.container.querySelector("[data-embers]")).toBeNull()
    cleanup()

    const calm = render(<Atmosphere recipe="photo" mood="warm" calm />)
    expect(calm.container.querySelector("[data-embers]")).toBeNull()
  })

  it("still lights the mood when calm: the picture stays", () => {
    const { container } = render(<Atmosphere recipe="photo" mood="warm" calm />)

    expect(activeMoods(container)).toEqual(["warm"])
  })
})

describe("Atmosphere photo", () => {
  it("shows an uploaded photo above the backdrop", () => {
    const { container } = render(
      <Atmosphere recipe="photo" backgroundUrl="/mine.jpg" />,
    )
    const img = getPhoto()

    expect(img.getAttribute("src")).toBe("/mine.jpg")
    // The bug this guards: an unpositioned image paints under the absolute
    // layer behind it, so an upload was fetched and never seen.
    expect(img).toHaveClass("absolute", "inset-0")
    expect(img).toHaveClass("object-contain")

    const layers = [...(container.firstElementChild?.children ?? [])]
    expect(layers.indexOf(img)).toBeGreaterThan(
      layers.findIndex((layer) => layer.classList.contains("rz-backdrop")),
    )
  })

  it("falls back to the backdrop, not a bundled photo, when the image errors", () => {
    const { container } = render(
      <Atmosphere recipe="photo" backgroundUrl="/broken.jpg" />,
    )

    fireEvent.error(getPhoto())

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector(".rz-backdrop")).not.toBeNull()
    expect(container.querySelector("[data-atmosphere-scrim]")).toBeNull()
  })

  it("uses a token-driven scrim instead of covering the image with canvas", () => {
    const { container } = render(
      <Atmosphere recipe="photo" backgroundUrl="/mine.jpg" />,
    )
    const scrim = container.querySelector("[data-atmosphere-scrim]")

    expect(scrim).not.toBeNull()
    expect(scrim).not.toHaveClass("bg-canvas")
    expect(scrim?.getAttribute("class")).toContain(
      "[background:var(--rz-scrim)]",
    )
  })

  it("drops the photo scrim after a dark image loads", () => {
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

  it("retains the scrim after a bright image loads", () => {
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

  it("retains the scrim when canvas luminance is unavailable", () => {
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

describe("Atmosphere ambient", () => {
  it("is the plain auth and config recipe, with no mood to light", () => {
    const { container } = render(<Atmosphere recipe="ambient" />)

    expect(container.querySelector("[data-mood]")).toBeNull()
    expect(container.querySelector(".bg-canvas")).not.toBeNull()
  })
})
