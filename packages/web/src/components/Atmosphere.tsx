import background from "@razzia/web/assets/background.png"
import { useState } from "react"

type Props = { recipe: "ambient" } | { recipe: "photo"; backgroundUrl?: string }

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
    />
  )
}

const PhotoAtmosphere = ({ backgroundUrl }: { backgroundUrl?: string }) => {
  const [failed, setFailed] = useState(false)
  const src = failed ? background : (backgroundUrl ?? background)

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
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-0 bg-[var(--rz-scrim)]" />
    </div>
  )
}

export default Atmosphere
