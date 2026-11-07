import { createFileRoute } from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { z } from "zod"

const LazyFrame = lazy(
  () => import("@razzia/web/features/rehearse/RehearsalFrame"),
)

const searchSchema = z.object({
  view: z.enum(["host", "phone"]).catch("host"),
  fixture: z.string().catch("answers"),
  q: z.coerce.number().int().min(0).catch(0),
  intensity: z.enum(["full", "calm", "silent"]).catch("full"),
  // Only there to make a reload play the screen again.
  n: z.coerce.number().int().optional().catch(undefined),
})

const RehearsalFrameRoute = () => {
  const { view, fixture, q, intensity } = Route.useSearch()

  return (
    <Suspense fallback={null}>
      <LazyFrame view={view} fixture={fixture} q={q} intensity={intensity} />
    </Suspense>
  )
}

export const Route = createFileRoute("/rehearse/frame")({
  component: RehearsalFrameRoute,
  validateSearch: searchSchema,
})
