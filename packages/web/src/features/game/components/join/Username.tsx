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
import { type KeyboardEvent, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

const SUBMIT_RETRY_MS = 4_000

const Username = () => {
  const { socket } = useSocket()
  const { gameId, login, setStatus, setVisuals } = usePlayerStore()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [shake, setShake] = useState(0)
  // What was sent, and that it has not been answered yet: the server answers
  // the name it got, and a second send would only draw an error over the lobby.
  const submitted = useRef<string | null>(null)
  const { t } = useTranslation()

  const handleLogin = () => {
    if (!gameId || submitted.current !== null) {
      return
    }

    submitted.current = username
    // A send lost on a dropped connection must not lock the form for good.
    setTimeout(() => {
      submitted.current = null
    }, SUBMIT_RETRY_MS)
    socket.emit(EVENTS.PLAYER.LOGIN, { gameId, data: { username } })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handleLogin()
    }
  }

  // The head count goes by before the lobby screen is there to hear it.
  useEvent(EVENTS.GAME.TOTAL_PLAYERS, (count) => {
    usePlayerStore.getState().setPlayersHere(count)
  })

  // A taken or refused name shakes the field (the message is the toast's).
  useEvent(EVENTS.GAME.ERROR_MESSAGE, (message) => {
    submitted.current = null
    setShake((count) => count + 1)

    // The game this PIN named is gone or has begun: asking again cannot work,
    // so the PIN form comes back.
    if (
      message === "errors:game.notFound" ||
      message === "errors:game.alreadyStarted"
    ) {
      usePlayerStore.getState().reset()
    }
  })

  useEvent(
    EVENTS.GAME.SUCCESS_JOIN,
    ({ gameId: joinedGameId, visuals, waitText }) => {
      setVisuals(visuals)
      setStatus(STATUS.WAIT, { text: waitText ?? "game:waitingForPlayers" })
      login(submitted.current ?? username)
      submitted.current = null

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
