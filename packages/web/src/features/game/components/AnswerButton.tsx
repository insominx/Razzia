import clsx from "clsx"
import { Check, X } from "lucide-react"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

type Props = PropsWithChildren &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string
    labelClassName?: string
    correct?: boolean
  }

const AnswerButton = ({
  className,
  label,
  labelClassName,
  children,
  correct,
  ...otherProps
}: Props) => {
  const CorrectIcon = correct ? Check : X

  return (
    <button
      className={clsx(
        "relative flex items-center gap-3 rounded-rz-xl border-2 px-4 py-6 text-left transition-transform duration-[var(--rz-dur-fast)] ease-calm hover:-translate-y-0.5",
        className,
      )}
      {...otherProps}
    >
      <span
        className={clsx(
          "font-mono flex size-8 shrink-0 items-center justify-center rounded-rz-sm border-2 text-base font-bold md:size-10 md:text-lg",
          labelClassName,
        )}
      >
        {label}
      </span>
      <p className="w-full flex-1 text-sm break-all md:text-lg">
        {children}
      </p>
      {correct !== undefined && (
        <CorrectIcon className="size-4 stroke-6 md:size-6" />
      )}
    </button>
  )
}

export default AnswerButton
