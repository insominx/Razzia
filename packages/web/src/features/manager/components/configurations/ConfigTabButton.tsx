import clsx from "clsx"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

const ConfigTabButton = ({
  children,
  active,
  ...otherProps
}: ButtonHTMLAttributes<HTMLButtonElement> &
  PropsWithChildren & { active?: boolean }) => (
  <button
    className={clsx(
      "text-text-muted hover:bg-surface hover:text-text-body flex-1 px-4 py-2 font-semibold transition-colors duration-[var(--rz-dur-fast)] ease-calm",
      active && "bg-brand-tint text-brand hover:bg-brand-tint hover:text-brand",
    )}
    {...otherProps}
  >
    <div>{children}</div>
  </button>
)

export default ConfigTabButton
