import clsx from "clsx"
import {
  type KeyboardEvent,
  type TextareaHTMLAttributes,
  useLayoutEffect,
  useRef,
} from "react"

type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "rows"
> & {
  value: string
  onValueChange: (_value: string) => void
}

const LINE_BREAKS = /\r\n|\r|\n/gu

/**
 * Wraps like a paragraph but edits like a single-line field: it grows to show
 * the whole text, Enter never inserts a newline, and pasted line breaks become
 * spaces, so stored questions and answers stay one line.
 */
const AutoGrowTextarea = ({
  value,
  onValueChange,
  onKeyDown,
  className,
  ...otherProps
}: Props) => {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const element = ref.current

    if (!element) {
      return
    }

    const fit = () => {
      element.style.height = "auto"
      element.style.height = `${element.scrollHeight}px`
    }

    fit()

    // Wrapping also changes when the column width does.
    if (typeof ResizeObserver === "undefined") {
      return
    }

    let width = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth
        fit()
      }
    })
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [value])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
    }

    onKeyDown?.(event)
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) =>
        onValueChange(event.target.value.replace(LINE_BREAKS, " "))
      }
      onKeyDown={handleKeyDown}
      className={clsx("resize-none overflow-hidden", className)}
      {...otherProps}
    />
  )
}

export default AutoGrowTextarea
