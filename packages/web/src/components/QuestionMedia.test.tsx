import QuestionMedia from "@razzia/web/components/QuestionMedia"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

const image = { type: "image", url: "https://example.com/a.png" } as const

const imageIn = (container: HTMLElement) => {
  const img = container.querySelector("img")

  if (!img) {
    throw new Error("expected an <img>")
  }

  return img
}

describe("QuestionMedia", () => {
  afterEach(() => {
    cleanup()
  })

  it("drops a broken image instead of printing its alt text", () => {
    const { container } = render(
      <QuestionMedia media={image} alt="The whole question again" />,
    )

    fireEvent.error(imageIn(container))

    expect(container.querySelector("img")).toBeNull()
    expect(screen.queryByText("The whole question again")).toBeNull()
  })

  it("renders the fallback in place of failed media", () => {
    const { container } = render(
      <QuestionMedia media={image} fallback={<p>Could not load</p>} />,
    )

    fireEvent.error(imageIn(container))

    expect(screen.getByText("Could not load")).toBeTruthy()
  })

  it("retries when the media changes after a failure", () => {
    const { container, rerender } = render(<QuestionMedia media={image} />)

    fireEvent.error(imageIn(container))
    rerender(
      <QuestionMedia
        media={{ type: "image", url: "https://example.com/b.png" }}
      />,
    )

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/b.png",
    )
  })
})
