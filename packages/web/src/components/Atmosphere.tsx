import background from "@razzia/web/assets/background.png"

type Props =
  | { recipe: "ambient" }
  | { recipe: "photo"; backgroundUrl?: string }

const Atmosphere = (props: Props) => {
  if (props.recipe === "ambient") {
    return (
      <div
        className="pointer-events-none absolute h-full max-h-svh w-full overflow-hidden"
        aria-hidden="true"
      >
        <div className="bg-canvas absolute inset-0" />
        <div className="bg-brand-tint absolute top-[-70vmin] left-[-50vmin] min-h-[120vmin] min-w-[120vmin] rotate-20 rounded-4xl" />
        <div className="bg-brand-tint absolute right-[-10vmin] bottom-[-45vmin] min-h-[75vmin] min-w-[75vmin] rotate-20 rounded-4xl" />
        <div className="absolute inset-0 bg-[var(--rz-vignette)]" />
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="bg-canvas absolute inset-0" />
      <img
        className="h-full w-full object-cover select-none"
        src={props.backgroundUrl ?? background}
        alt=""
      />
      <div className="absolute inset-0 bg-[var(--rz-scrim)]" />
      <div className="absolute inset-0 bg-[var(--rz-vignette)]" />
    </div>
  )
}

export default Atmosphere
