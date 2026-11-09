import NotFound from "@razzia/web/components/NotFound"
import { createFileRoute } from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { z } from "zod"

// Same fold as the gallery: in a production build `import.meta.env.DEV` is
// `false`, the dynamic import is unreachable and no frame chunk is emitted.
// Do not hoist the `lazy()` call out of the ternary.
const LazyFrame = import.meta.env.DEV
  ? lazy(() => import("@razzia/web/features/dev/FramePage"))
  : null

const searchSchema = z.object({
  view: z.enum(["host", "phone"]).catch("host"),
  fixture: z.string().catch("answers"),
  quiz: z.string().catch(""),
  q: z.coerce.number().int().min(0).catch(0),
  dialect: z.enum(["dark-everywhere", "stage-studio"]).catch("dark-everywhere"),
  surface: z.enum(["stage", "studio"]).catch("stage"),
  motion: z.enum(["on", "off"]).catch("on"),
  intensity: z.enum(["full", "calm", "silent"]).catch("full"),
})

const FramePageRoute = () => {
  const search = Route.useSearch()

  return LazyFrame ? (
    <Suspense fallback={null}>
      <LazyFrame {...search} />
    </Suspense>
  ) : (
    <NotFound />
  )
}

export const Route = createFileRoute("/dev/frame")({
  component: FramePageRoute,
  validateSearch: searchSchema,
})
