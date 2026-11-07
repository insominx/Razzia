import logo from "@razzia/web/assets/logo.svg"
import clsx from "clsx"

interface Props {
  className?: string
}

/**
 * The wordmark in the brand colour. It is the svg used as a mask over a brand
 * fill, so it follows the palette (and the light theme) instead of carrying
 * its own orange.
 */
const Logo = ({ className }: Props) => (
  <span
    role="img"
    aria-label="Razzia"
    className={clsx("bg-brand block aspect-[333/80]", className)}
    style={{
      maskImage: `url(${logo})`,
      WebkitMaskImage: `url(${logo})`,
      maskRepeat: "no-repeat",
      WebkitMaskRepeat: "no-repeat",
      maskSize: "contain",
      WebkitMaskSize: "contain",
      maskPosition: "center",
      WebkitMaskPosition: "center",
    }}
  />
)

export default Logo
