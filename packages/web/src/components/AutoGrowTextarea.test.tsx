import AutoGrowTextarea from "@razzia/web/components/AutoGrowTextarea"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

describe("AutoGrowTextarea", () => {
  afterEach(() => {
    cleanup()
  })

  it("turns pasted line breaks into spaces", () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <AutoGrowTextarea value="" onValueChange={onValueChange} />,
    )

    fireEvent.change(container.querySelector("textarea") as HTMLElement, {
      target: { value: "First line\nsecond\r\nthird" },
    })

    expect(onValueChange).toHaveBeenCalledWith("First line second third")
  })

  it("never inserts a newline on Enter but still forwards the key", () => {
    const onKeyDown = vi.fn()
    const { container } = render(
      <AutoGrowTextarea
        value=""
        onValueChange={vi.fn()}
        onKeyDown={onKeyDown}
      />,
    )

    const textarea = container.querySelector("textarea") as HTMLElement
    const notPrevented = fireEvent.keyDown(textarea, { key: "Enter" })

    expect(notPrevented).toBe(false)
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })

  it("starts as a single row that grows instead of scrolling", () => {
    const { container } = render(
      <AutoGrowTextarea value="Hello" onValueChange={vi.fn()} />,
    )
    const textarea = container.querySelector("textarea")

    expect(textarea).toHaveAttribute("rows", "1")
    expect(textarea).toHaveClass("resize-none", "overflow-hidden")
  })
})
