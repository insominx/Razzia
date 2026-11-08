import Input from "@razzia/web/components/Input"
import { useEffect, useState } from "react"

interface Props {
  value: number
  min?: number
  max?: number
  onChange: (_value: number) => void
}

const clamp = (num: number, min?: number, max?: number) =>
  Math.min(max ?? num, Math.max(min ?? num, num))

const ConfigNumberInput = ({ value, min, max, onChange }: Props) => {
  const [input, setInput] = useState(String(value))

  // Follow the value when it changes from outside, but never rewrite what is
  // being typed into something that already means the same number.
  useEffect(() => {
    setInput((current) =>
      Number(current) === value && current.trim() !== ""
        ? current
        : String(value),
    )
  }, [value])

  // Typing is left alone: clamping each keystroke turned "10" into "5" then
  // "50" for a minimum of 5. Only whole numbers already in range are passed
  // on; the rest is settled when the field is left.
  const handleChange = (raw: string) => {
    setInput(raw)

    if (!/^\d+$/u.test(raw)) {
      return
    }

    const num = Number(raw)

    if (num === clamp(num, min, max)) {
      onChange(num)
    }
  }

  const handleBlur = () => {
    const num = Number(input)

    if (input.trim() === "" || !Number.isFinite(num)) {
      setInput(String(value))

      return
    }

    const settled = clamp(Math.round(num), min, max)

    setInput(String(settled))

    if (settled !== value) {
      onChange(settled)
    }
  }

  return (
    <Input
      variant="sm"
      type="number"
      min={min}
      max={max}
      value={input}
      onChange={(e) => handleChange(e.target.value)}
      step={1}
      onBlur={handleBlur}
      className="w-full"
    />
  )
}

export default ConfigNumberInput
