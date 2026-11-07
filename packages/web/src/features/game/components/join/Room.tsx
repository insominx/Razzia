import { EVENTS } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import PinInput from "@razzia/web/components/PinInput"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

const Room = () => {
  const { socket, isConnected } = useSocket()
  const { join, resetStatus } = usePlayerStore()
  const navigate = useNavigate()
  const [invitation, setInvitation] = useState("")
  const [shake, setShake] = useState(0)
  const { pin } = useSearch({ from: "/(auth)/" })
  const hasJoinedRef = useRef(false)
  const { t } = useTranslation()

  const handleJoin = () => {
    socket.emit(EVENTS.PLAYER.JOIN, invitation.replace(/\s/gu, ""))
  }

  useEvent(EVENTS.GAME.SUCCESS_ROOM, (gameId) => {
    join(gameId)
  })

  // A wrong PIN shakes the cells (the message itself is the toast's).
  useEvent(EVENTS.GAME.ERROR_MESSAGE, () => {
    setShake((count) => count + 1)
  })

  // A player already in a started game goes straight back to it; the game
  // page reconnects when it opens without a status.
  useEvent(EVENTS.GAME.SUCCESS_REJOIN, (gameId) => {
    resetStatus()
    navigate({ to: "/party/$gameId", params: { gameId } })
  })

  useEffect(() => {
    if (!isConnected || !pin || hasJoinedRef.current) {
      return
    }

    socket.emit("player:join", pin)
    hasJoinedRef.current = true
  }, [pin, isConnected, socket])

  return (
    <Card>
      <p className="mb-2 text-lg font-semibold">{t("game:pinLabel")}</p>
      {/* A new key restarts the shake on every wrong PIN. */}
      <div
        key={shake}
        data-shake={shake}
        className={shake > 0 ? "rz-shake" : undefined}
      >
        <PinInput
          autoFocus
          value={invitation}
          onChange={setInvitation}
          onSubmit={handleJoin}
        />
      </div>
      <Button className="mt-4" onClick={handleJoin}>
        {t("common:submit")}
      </Button>
    </Card>
  )
}

export default Room
