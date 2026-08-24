import background from "@razzia/web/assets/background.png"
import {
  averageLuminance,
  isDarkPhoto,
} from "@razzia/web/features/visuals/photo-luminance"
import clsx from "clsx"
import { useState } from "react"

type PhotoPlacement = "viewport" | "container"

type Props =
  | { recipe: "ambient" }
  | {
      recipe: "photo"
      backgroundUrl?: string
      placement?: PhotoPlacement
    }

const Atmosphere = (props: Props) => {
  if (props.recipe === "ambient") {
    return (
      <div
        className="rounded-rz-xl pointer-events-none absolute inset-0 z-0 h-full max-h-svh w-full overflow-hidden"
        aria-hidden="true"
      >
        <div className="bg-canvas absolute inset-0" />
        <div className="bg-brand-tint rounded-rz-xl absolute top-[-70vmin] left-[-50vmin] min-h-[120vmin] min-w-[120vmin] rotate-20" />
        <div className="bg-brand-tint rounded-rz-xl absolute right-[-10vmin] bottom-[-45vmin] min-h-[75vmin] min-w-[75vmin] rotate-20" />
      </div>
    )
  }

  return (
    <PhotoAtmosphere
      key={props.backgroundUrl ?? "bundled"}
      backgroundUrl={props.backgroundUrl}
      placement={props.placement}
    />
  )
}

const PhotoAtmosphere = ({
  backgroundUrl,
  placement = "viewport",
}: {
  backgroundUrl?: string
  placement?: PhotoPlacement
}) => {
  const [failed, setFailed] = useState(false)
  const [darkPhoto, setDarkPhoto] = useState(false)
  const src = failed ? background : (backgroundUrl ?? background)

  return (
    <div
      className={clsx(
        "pointer-events-none inset-0 z-0 overflow-hidden",
        placement === "viewport" ? "fixed" : "absolute",
      )}
      aria-hidden="true"
    >
      <div className="bg-canvas absolute inset-0" />
      <img
        className={clsx(
          "h-full w-full object-contain select-none",
          darkPhoto && "[filter:var(--rz-dark-photo-lift)]",
        )}
        src={src}
        alt=""
        role="presentation"
        onLoad={(event) => {
          setDarkPhoto(isDarkPhoto(averageLuminance(event.currentTarget)))
        }}
        onError={() => {
          setFailed(true)
          setDarkPhoto(false)
        }}
      />
      {!darkPhoto && (
        <div
          className="absolute inset-0 [background:var(--rz-scrim)]"
          data-atmosphere-scrim=""
        />
      )}
    </div>
  )
}

export default Atmosphere
