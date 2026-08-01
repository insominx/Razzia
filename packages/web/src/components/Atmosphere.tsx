import background from "@razzia/web/assets/background.png"
import { useEffect, useState } from "react"

type Props =
  | { recipe: "ambient" }
  | { recipe: "photo"; backgroundUrl?: string }

const Atmosphere = (props: Props) => {
  if (props.recipe === "ambient") {
    return (
      <div
        className="pointer-events-none absolute inset-0 z-0 h-full max-h-svh w-full overflow-hidden rounded-rz-xl"
        aria-hidden="true"
      >
        <div className="bg-canvas absolute inset-0" />
        <div className="bg-[var(--rz-atmosphere-blob)] absolute top-[-70vmin] left-[-50vmin] min-h-[120vmin] min-w-[120vmin] rotate-20 rounded-rz-xl" />
        <div className="bg-[var(--rz-atmosphere-blob)] absolute right-[-10vmin] bottom-[-45vmin] min-h-[75vmin] min-w-[75vmin] rotate-20 rounded-rz-xl" />
      </div>
    )
  }

  return <PhotoAtmosphere backgroundUrl={props.backgroundUrl} />
}

const PhotoAtmosphere = ({ backgroundUrl }: { backgroundUrl?: string }) => {
  const [src, setSrc] = useState(backgroundUrl ?? background)

  useEffect(() => {
    setSrc(backgroundUrl ?? background)
  }, [backgroundUrl])

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="bg-canvas absolute inset-0" />
      <img
        className="h-full w-full object-cover select-none"
        src={src}
        alt=""
        role="presentation"
        onError={() => {
          if (src !== background) {
            setSrc(background)
          }
        }}
      />
      <div className="absolute inset-0 bg-[var(--rz-scrim)]" />
    </div>
  )
}

export default Atmosphere
