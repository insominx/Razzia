import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"

import { useNavigate } from "@tanstack/react-router"
import { type KeyboardEvent, useState } from "react"
import { useTranslation } from "react-i18next"

const Username = () => {
  const { socket } = useSocket()
  const { gameId, login, setStatus, setVisuals } = usePlayerStore()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [shake, setShake] = useState(0)
  const { t } = useTranslation()

  const handleLogin = () => {
    if (!gameId) {
      return
    }

    socket.emit(EVENTS.PLAYER.LOGIN, { gameId, data: { username } })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handleLogin()
    }
  }

  // A taken or refused name shakes the field (the message is the toast's).
  useEvent(EVENTS.GAME.ERROR_MESSAGE, () => {
    setShake((count) => count + 1)
  })

  useEvent(
    EVENTS.GAME.SUCCESS_JOIN,
    ({ gameId: joinedGameId, visuals, waitText }) => {
      setVisuals(visuals)
      setStatus(STATUS.WAIT, { text: waitText ?? "game:waitingForPlayers" })
      login(username)

      navigate({ to: "/party/$gameId", params: { gameId: joinedGameId } })
    },
  )

  return (
    <Card>
      <div
        key={shake}
        data-shake={shake}
        className={shake > 0 ? "rz-shake" : undefined}
      >
        <Input
          autoFocus
          className="w-full text-center"
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("game:usernamePlaceholder")}
        />
      </div>
      <Button className="mt-4" onClick={handleLogin}>
        {t("common:submit")}
      </Button>
    </Card>
  )
}

export default Username
