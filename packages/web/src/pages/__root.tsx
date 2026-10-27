import ErrorPage from "@razzia/web/components/ErrorPage"
import NotFound from "@razzia/web/components/NotFound"
import DeckBridge from "@razzia/web/features/deck/DeckBridge"
import { IS_DECK_EMBED } from "@razzia/web/features/deck/embed"
import {
  SocketProvider,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import {
  SurfaceOverrideContext,
  type SurfaceOverride,
  useSurface,
} from "@razzia/web/hooks/use-surface"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { useEffect, useState } from "react"

const GameLayout = () => {
  const { isConnected, connect } = useSocket()
  const [surfaceOverride, setSurfaceOverride] =
    useState<SurfaceOverride | null>(null)

  useSurface(surfaceOverride)

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  return (
    <SurfaceOverrideContext.Provider value={setSurfaceOverride}>
      {IS_DECK_EMBED && <DeckBridge />}
      <div className="bg-canvas text-text-body antialiased">
        <Outlet />
      </div>
    </SurfaceOverrideContext.Provider>
  )
}

export const Route = createRootRoute({
  component: () => (
    <SocketProvider>
      <GameLayout />
    </SocketProvider>
  ),
  errorComponent: ({ error }) => (
    <div className="bg-canvas text-text-body antialiased">
      <ErrorPage error={error} />
    </div>
  ),
  notFoundComponent: () => (
    <div className="bg-canvas text-text-body antialiased">
      <NotFound />
    </div>
  ),
})
