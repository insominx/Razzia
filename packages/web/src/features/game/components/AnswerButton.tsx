import clsx from "clsx"
import { Check, X } from "lucide-react"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

type Props = PropsWithChildren &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string
    correct?: boolean
  }

const AnswerButton = ({
  className,
  label,
  children,
  correct,
  ...otherProps
}: Props) => {
  const CorrectIcon = correct ? Check : X

  return (
    <button
      className={clsx(
        "rounded-rz-lg ease-calm relative flex items-center gap-3 border-2 px-4 py-6 text-left transition-transform duration-[var(--rz-dur-fast)] hover:-translate-y-0.5",
        className,
      )}
      {...otherProps}
    >
      <span className="rounded-rz-sm bg-canvas/25 flex size-8 shrink-0 items-center justify-center border-2 border-current font-mono text-base font-bold md:size-10 md:text-lg">
        {label}
      </span>
      <p className="text-text-primary min-w-0 flex-1 text-sm wrap-break-word md:text-lg">
        {children}
      </p>
      {correct !== undefined && (
        <CorrectIcon
          className={clsx(
            "size-4 shrink-0 stroke-6 md:size-6",
            correct ? "text-success" : "text-danger",
          )}
        />
      )}
    </button>
  )
}

export default AnswerButton
