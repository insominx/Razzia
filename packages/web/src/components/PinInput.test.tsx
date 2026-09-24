import PinInput from "@razzia/web/components/PinInput"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

describe("PinInput", () => {
  afterEach(() => {
    cleanup()
  })

  it("submits on Enter from any digit", () => {
    const onSubmit = vi.fn()
    const { container } = render(
      <PinInput value="123" onChange={vi.fn()} onSubmit={onSubmit} />,
    )
    const inputs = container.querySelectorAll("input")

    fireEvent.keyDown(inputs[2], { key: "Enter" })
    fireEvent.keyDown(inputs[5], { key: "Enter" })

    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it("keeps Backspace editing digits rather than submitting", () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const { container } = render(
      <PinInput value="12" onChange={onChange} onSubmit={onSubmit} />,
    )

    fireEvent.keyDown(container.querySelectorAll("input")[1], {
      key: "Backspace",
    })

    expect(onChange).toHaveBeenCalledWith("1")
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
