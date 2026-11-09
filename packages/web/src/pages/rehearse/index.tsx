import { createFileRoute } from "@tanstack/react-router"
import { lazy, Suspense } from "react"

// The rehearsal needs no login and no game: it plays a draft the editor saved
// in this browser. It loads on its own, so the game screens that build it are
// not on the critical path of anyone who never rehearses.
const LazyRehearsal = lazy(
  () => import("@razzia/web/features/rehearse/RehearsalPage"),
)

const RehearsalRoute = () => (
  <Suspense fallback={null}>
    <LazyRehearsal />
  </Suspense>
)

export const Route = createFileRoute("/rehearse/")({
  component: RehearsalRoute,
})
