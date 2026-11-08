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

const PENDING_RETRY_MS = 4_000
const PIN_LENGTH = 6

const Room = () => {
  const { socket, isConnected } = useSocket()
  const { join, resetStatus } = usePlayerStore()
  const navigate = useNavigate()
  const [invitation, setInvitation] = useState("")
  const [shake, setShake] = useState(0)
  const { pin } = useSearch({ from: "/(auth)/" })
  const hasJoinedRef = useRef(false)
  // A PIN sent and not yet answered: a double tap must not send it twice.
  const pending = useRef(false)
  const { t } = useTranslation()

  const handleJoin = () => {
    const cleaned = invitation.replace(/\s/gu, "")

    // A partial or gappy PIN cannot be right; do not spend a round trip on it.
    if (cleaned.length !== PIN_LENGTH) {
      setShake((count) => count + 1)

      return
    }

    if (pending.current) {
      return
    }

    pending.current = true
    // A send lost on a dropped connection must not lock the form for good.
    setTimeout(() => {
      pending.current = false
    }, PENDING_RETRY_MS)
    socket.emit(EVENTS.PLAYER.JOIN, cleaned)
  }

  useEvent(EVENTS.GAME.SUCCESS_ROOM, (gameId) => {
    pending.current = false
    join(gameId)
  })

  // A wrong PIN shakes the cells (the message itself is the toast's).
  useEvent(EVENTS.GAME.ERROR_MESSAGE, () => {
    pending.current = false
    setShake((count) => count + 1)
  })

  // A player already in a started game goes straight back to it; the game
  // page reconnects when it opens without a status.
  useEvent(EVENTS.GAME.SUCCESS_REJOIN, (gameId) => {
    pending.current = false
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
