import ConfigNumberInput from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigNumberInput"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const Harness = ({ onChange }: { onChange: (_value: number) => void }) => {
  const [value, setValue] = useState(20)

  return (
    <ConfigNumberInput
      value={value}
      min={5}
      max={60}
      onChange={(next) => {
        onChange(next)
        setValue(next)
      }}
    />
  )
}

const spinbutton = () => {
  const input = screen.getByRole("spinbutton")

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected the spinbutton to be an input")
  }

  return input
}

describe("ConfigNumberInput", () => {
  afterEach(() => {
    cleanup()
  })

  it("lets a multi-digit value be typed past a digit under the minimum", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = spinbutton()

    fireEvent.change(input, { target: { value: "1" } })

    expect(input.value).toBe("1")

    fireEvent.change(input, { target: { value: "10" } })

    expect(input.value).toBe("10")
    expect(onChange).toHaveBeenLastCalledWith(10)
  })

  it("clamps and rounds on blur", () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = spinbutton()

    fireEvent.change(input, { target: { value: "1" } })
    fireEvent.blur(input)

    expect(input.value).toBe("5")
    expect(onChange).toHaveBeenLastCalledWith(5)

    fireEvent.change(input, { target: { value: "99" } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenLastCalledWith(60)

    fireEvent.change(input, { target: { value: "7.5" } })
    fireEvent.blur(input)

    expect(Number.isInteger(Number(input.value))).toBe(true)
  })
})
