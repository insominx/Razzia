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
import { clearDraft } from "@razzia/web/features/rehearse/draft"
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef } from "react"

const ManagerConfigPage = () => {
  const { isConnected } = useSocket()
  const { setConfig, config } = useManagerStore()
  const navigate = useNavigate()
  const hadConfig = useRef(false)

  // Logout empties the store under this page, and nothing else does while it
  // is open. The rehearsed draft holds the quiz's answers and /rehearse asks
  // for no login, so it goes too: the next person at a shared computer must
  // not find it there.
  useEffect(() => {
    if (config) {
      hadConfig.current = true

      return
    }

    if (hadConfig.current) {
      hadConfig.current = false
      clearDraft()
    }
  }, [config])

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
