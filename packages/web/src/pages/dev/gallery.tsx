import NotFound from "@razzia/web/components/NotFound"
import { createFileRoute } from "@tanstack/react-router"
import { lazy, Suspense } from "react"

// Kept behind a statically foldable branch: in a production build
// `import.meta.env.DEV` is replaced with `false`, the ternary collapses to
// `null`, and the dynamic import becomes unreachable, so Rollup never emits
// the gallery chunk. Do not hoist the `lazy()` call out of the ternary.
const LazyGallery = import.meta.env.DEV
  ? lazy(() => import("@razzia/web/features/dev/Gallery"))
  : null

const GalleryPage = () =>
  LazyGallery ? (
    <Suspense fallback={null}>
      <LazyGallery />
    </Suspense>
  ) : (
    <NotFound />
  )

export const Route = createFileRoute("/dev/gallery")({
  component: GalleryPage,
})
