import clsx from "clsx"
import { Check, X } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

type SurfaceState = "locked" | "active"
type HoverEffect = "lift" | "glow" | "none"

type Props = PropsWithChildren &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string
    correct?: boolean
    surface?: { className: string; state: SurfaceState }
  }

const CALM_EASE = [0.16, 1, 0.3, 1] as const
const LOCKED_SURFACE_FILTER = "blur(2px) saturate(0.3) brightness(0.92)"
const FLASH_SURFACE_FILTER = "blur(0px) saturate(1.65) brightness(1.22)"
const SETTLED_SURFACE_FILTER = "blur(0px) saturate(1) brightness(1)"

const AnswerButton = ({
  className,
  label,
  children,
  correct,
  surface,
  ...otherProps
}: Props) => {
  const CorrectIcon = correct ? Check : X
  const reducedMotion = useReducedMotion()
  const hoverEffect: HoverEffect = (() => {
    if (!surface) {
      return "lift"
    }

    if (surface.state === "locked") {
      return "none"
    }

    return "glow"
  })()
  const surfaceAnimation = (() => {
    if (surface?.state === "locked") {
      return {
        opacity: 0.5,
        filter: LOCKED_SURFACE_FILTER,
      }
    }

    if (reducedMotion) {
      return {
        opacity: 1,
        filter: SETTLED_SURFACE_FILTER,
      }
    }

    return {
      opacity: [0.5, 1, 1],
      filter: [
        LOCKED_SURFACE_FILTER,
        FLASH_SURFACE_FILTER,
        SETTLED_SURFACE_FILTER,
      ],
    }
  })()
  const surfaceTransition = (() => {
    if (reducedMotion) {
      return { duration: 0 }
    }

    if (surface?.state === "active") {
      return { duration: 0.7, times: [0, 0.38, 1], ease: CALM_EASE }
    }

    return { duration: 0.35, ease: CALM_EASE }
  })()

  return (
    <button
      className={clsx(
        "rounded-rz-lg ease-calm relative flex items-center gap-3 border-2 px-4 py-6 text-left transition-transform duration-[var(--rz-dur-fast)] 2xl:gap-4 2xl:px-6 2xl:py-7",
        hoverEffect === "lift" && "hover:-translate-y-0.5",
        surface && "border-transparent bg-transparent",
        className,
      )}
      data-hover-effect={hoverEffect}
      {...otherProps}
    >
      {surface && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          <motion.span
            initial={false}
            animate={surfaceAnimation}
            transition={surfaceTransition}
            data-answer-surface
            data-answer-surface-state={surface.state}
            data-answer-surface-effect={
              surface.state === "locked" ? "blurred" : "flash"
            }
            className={clsx(
              "absolute inset-0 rounded-[inherit] border-2",
              surface.className,
            )}
          />
        </span>
      )}

      {hoverEffect === "glow" && (
        <span
          aria-hidden="true"
          className="rz-answer-hover-glow"
          data-answer-hover-glow
        />
      )}

      <span className="rounded-rz-sm bg-canvas/25 relative z-10 flex size-8 shrink-0 items-center justify-center border-2 border-current font-mono text-base font-bold md:size-10 md:text-lg 2xl:size-12 2xl:text-2xl">
        {label}
      </span>
      {/* Projection scale: hosts drive a 720p–1080p screen read from across a
          room, so copy keeps growing past `md` instead of stopping at 18px. */}
      <p className="text-text-primary relative z-10 min-w-0 flex-1 text-sm wrap-break-word md:text-lg xl:text-2xl 2xl:text-3xl">
        {children}
      </p>
      {correct !== undefined && (
        <CorrectIcon
          className={clsx(
            "relative z-10 size-4 shrink-0 stroke-6 md:size-6 2xl:size-8",
            correct ? "text-success" : "text-danger",
          )}
        />
      )}
    </button>
  )
}

export default AnswerButton
