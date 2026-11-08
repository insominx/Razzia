import { EVENTS } from "@razzia/common/constants"
import Loader from "@razzia/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

export const Route = createFileRoute("/manager/quizz")({
  component: RouteComponent,
})

const StudioLoader = () => (
  <div className="bg-canvas flex h-svh items-center justify-center">
    <Loader className="text-brand max-h-23" />
  </div>
)

function RouteComponent() {
  const { socket, isConnected } = useSocket()
  const { config, setConfig, reset } = useManagerStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isConnected && !config) {
      socket.emit(EVENTS.MANAGER.GET_CONFIG)
    }
  }, [isConnected, config, socket])

  useEvent(EVENTS.MANAGER.CONFIG, (data) => {
    setConfig(data)
  })

  // The server no longer knows this login: the cached quizzes and results
  // must not stay behind to pass the guards when Back returns here.
  useEvent(EVENTS.MANAGER.UNAUTHORIZED, () => {
    reset()
    // Unsaved edits cannot be saved by a host the server no longer knows, so
    // the editor's leave prompt must not hold them here.
    navigate({ to: "/manager", ignoreBlocker: true })
  })

  // Only until the config first arrives: a reconnect blip must not unmount the
  // editor and the quiz being written in it.
  if (!config) {
    return <StudioLoader />
  }

  return <Outlet />
}
