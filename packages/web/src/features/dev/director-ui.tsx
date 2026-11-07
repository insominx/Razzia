import clsx from "clsx"
import type { ComponentProps } from "react"

export const Button = ({
  active = false,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { active?: boolean }) => (
  <button
    type="button"
    aria-pressed={active}
    className={clsx(
      "rounded-rz-sm border px-3 py-2 text-sm font-semibold transition disabled:opacity-40",
      active
        ? "border-brand-border bg-brand-tint text-brand"
        : "border-border bg-panel text-text-muted hover:text-text-primary",
      className,
    )}
    {...props}
  >
    {children}
  </button>
)

export const Toggle = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ label: string; value: T }>
  value: T
  onChange: (value: T) => void
}) => (
  <fieldset className="flex flex-wrap items-center gap-2">
    <legend className="text-text-muted mr-2 text-xs font-bold tracking-widest uppercase">
      {label}
    </legend>
    {options.map((option) => (
      <Button
        key={option.value}
        active={value === option.value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </Button>
    ))}
  </fieldset>
)

export const Select = ({
  label,
  className,
  children,
  ...props
}: ComponentProps<"select"> & { label: string }) => (
  <label className="text-text-muted flex min-w-0 flex-col gap-1 text-xs font-bold tracking-widest uppercase">
    {label}
    <select
      className={clsx(
        "rounded-rz-sm border-border bg-panel text-text-primary border px-3 py-2 text-sm font-semibold tracking-normal normal-case",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  </label>
)
