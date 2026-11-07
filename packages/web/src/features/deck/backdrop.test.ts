import { applyBackdrop } from "@razzia/web/features/deck/backdrop"
import { describe, expect, it } from "vitest"

describe("applyBackdrop", () => {
  it("marks the page when the slide is to show through, and clears the mark after", () => {
    const root = document.createElement("html")

    applyBackdrop("slide", root)
    expect(root.dataset.backdrop).toBe("slide")

    applyBackdrop("own", root)
    expect(root.dataset.backdrop).toBeUndefined()
  })

  it("leaves a page that never asked as it was", () => {
    const root = document.createElement("html")

    applyBackdrop("own", root)
    expect(root.hasAttribute("data-backdrop")).toBe(false)
  })
})
