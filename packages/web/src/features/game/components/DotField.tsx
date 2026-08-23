import clsx from "clsx"

interface Props {
  side: "left" | "right"
}

/**
 * Decorative dot texture flanking the answer grid. Hidden on narrow screens,
 * where the grid uses the full width.
 */
const DotField = ({ side }: Props) => (
  <div
    aria-hidden="true"
    className={clsx(
      "rz-dotfield pointer-events-none absolute top-1/2 hidden h-52 w-36 -translate-y-1/2 opacity-40 xl:block",
      side === "left" ? "-left-36" : "-right-36",
    )}
  />
)

export default DotField
