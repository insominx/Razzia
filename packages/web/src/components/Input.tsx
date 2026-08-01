import clsx from "clsx"
import React from "react"

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: "sm" | "md"
}

const Input = ({
  className,
  type = "text",
  variant = "md",
  ...otherProps
}: Props) => (
  <input
    type={type}
    className={clsx(
      "bg-surface text-text-body placeholder:text-text-muted outline-border focus:outline-brand rounded-rz-md font-semibold outline-2",
      variant === "md" && "p-2 text-lg",
      variant === "sm" && "px-3 py-2 text-sm",
      className,
    )}
    {...otherProps}
  />
)

export default Input
