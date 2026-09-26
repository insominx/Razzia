import { EVENTS } from "@razzia/common/constants"
import Background from "@razzia/web/components/Background"
import Loader from "@razzia/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import Configurations from "@razzia/web/features/manager/components/configurations"
import { useFollowCreatedGame } from "@razzia/web/features/manager/hooks/use-follow-created-game"
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router"

const ManagerConfigPage = () => {
  const { isConnected } = useSocket()
  const { setConfig, config } = useManagerStore()
  const navigate = useNavigate()

  useEvent(EVENTS.MANAGER.CONFIG, (data) => {
    setConfig(data)
  })

  useEvent(EVENTS.MANAGER.UNAUTHORIZED, () => {
    navigate({ to: "/manager" })
  })

  useFollowCreatedGame()

  if (!isConnected) {
    return (
      <Background>
        <Loader className="h-23" />
      </Background>
    )
  }

  if (!config) {
    return <Navigate to="/manager" replace />
  }

  return (
    <Background>
      <Configurations data={config} />
    </Background>
  )
}

export const Route = createFileRoute("/manager/config")({
  component: ManagerConfigPage,
})
