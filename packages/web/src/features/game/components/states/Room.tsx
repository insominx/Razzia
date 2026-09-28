import * as AlertDialog from "@radix-ui/react-alert-dialog"
import { EVENTS } from "@razzia/common/constants"
import type { PublicPlayer } from "@razzia/common/types/game"
import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import ConfirmDialog from "@razzia/web/components/AlertDialog"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useSfx } from "@razzia/web/features/game/hooks/use-sfx"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { SFX, sfxVolume } from "@razzia/web/features/game/utils/constants"
import { useOnClickOutside } from "@razzia/web/hooks/useOnClickOutside"
import { Maximize2, X } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: ManagerStatusDataMap["SHOW_ROOM"]
}

const Room = ({ data: { text, inviteCode } }: Props) => {
  const { gameId } = useManagerStore()
  const { socket } = useSocket()
  const webUrl = window.location.origin
  const { players } = useManagerStore()
  const [playerList, setPlayerList] = useState<PublicPlayer[]>(players)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [qrOpen, setQrOpen] = useState(false)
  const qrContentRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const sfx = useSfx()
  const joinSrc = sfx(SFX.ANSWERS.SOUND)
  const [sfxJoin] = useSound(joinSrc, { volume: sfxVolume(joinSrc) })

  useOnClickOutside({ ref: qrContentRef, handler: () => setQrOpen(false) })

  useEvent(EVENTS.MANAGER.NEW_PLAYER, (player) => {
    setPlayerList([...playerList, player])
    sfxJoin()
  })

  useEvent(EVENTS.MANAGER.REMOVE_PLAYER, (playerId) => {
    setPlayerList(playerList.filter((p) => p.id !== playerId))
  })

  useEvent(EVENTS.MANAGER.PLAYER_KICKED, (playerId) => {
    setPlayerList(playerList.filter((p) => p.id !== playerId))
  })

  useEvent(EVENTS.GAME.TOTAL_PLAYERS, (total) => {
    setTotalPlayers(total)
  })

  const handleKick = (playerId: string) => () => {
    if (!gameId) {
      return
    }

    socket.emit(EVENTS.MANAGER.KICK_PLAYER, {
      gameId,
      playerId,
    })
  }

  const handleCloseQrCode = () => setQrOpen(false)

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-2">
      <div className="mb-10 flex flex-col-reverse items-center gap-3 md:flex-row md:items-stretch">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="bg-surface border-border text-text-body rounded-rz-lg flex flex-col items-center justify-center border px-6 py-4 md:flex-row">
            <div>
              <p className="text-2xl font-bold 2xl:text-4xl">
                {t("game:joinInstruction")}
              </p>
              <p className="max-w-64 text-lg font-extrabold break-all lg:max-w-96 lg:text-2xl 2xl:text-3xl">
                {webUrl}
              </p>
            </div>

            <div className="bg-border my-4 h-0.5 w-full md:mx-4 md:h-full md:w-0.5" />

            <div>
              <p className="text-2xl font-bold 2xl:text-4xl">
                {t("game:gamePinLabel")}
              </p>
              <p className="font-mono text-6xl font-extrabold lg:text-7xl 2xl:text-9xl">
                {inviteCode}
              </p>
            </div>
          </div>
        </div>

        <AlertDialog.Root open={qrOpen} onOpenChange={setQrOpen}>
          <AlertDialog.Trigger asChild>
            {/* Scanned from seats across the room, so it grows with the screen. */}
            <div className="bg-surface border-border rounded-rz-lg group relative flex h-40 shrink-0 cursor-pointer border p-2 lg:h-56 2xl:h-80 2xl:p-3">
              <QRCodeSVG
                className="h-auto w-auto"
                bgColor="#ffffff"
                fgColor="#000000"
                value={`${webUrl}?pin=${inviteCode}`}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-xl opacity-0 transition-opacity group-hover:opacity-100">
                <div className="bg-overlay rounded-rz-md p-2">
                  <Maximize2 className="text-on-accent size-6" />
                </div>
              </div>
            </div>
          </AlertDialog.Trigger>

          <AlertDialog.Portal>
            <AlertDialog.Overlay className="bg-overlay data-[state=open]:animate-rz-fade-in fixed inset-0 z-50" />
            <AlertDialog.Content
              ref={qrContentRef}
              className="bg-surface border-border rounded-rz-xl data-[state=open]:animate-rz-fade-in fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 border p-6"
            >
              <AlertDialog.Title className="sr-only">
                {t("game:gamePinLabel")}
              </AlertDialog.Title>
              <AlertDialog.Description className="sr-only">
                {t("game:joinInstruction")}
              </AlertDialog.Description>
              <button
                onClick={handleCloseQrCode}
                className="bg-surface border-border text-text-body hover:bg-panel ease-calm absolute -top-3 -right-3 rounded-full border p-1.5 transition-colors"
              >
                <X className="size-6" />
              </button>
              <QRCodeSVG
                className="size-56 md:size-70 lg:size-95"
                bgColor="#ffffff"
                fgColor="#000000"
                value={`${webUrl}?pin=${inviteCode}`}
              />
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>

      <h2 className="text-text-primary mb-4 text-4xl font-bold 2xl:text-5xl">
        {t(text)}
      </h2>

      <div className="bg-panel border-border rounded-rz-md mb-6 flex items-center justify-center border px-6 py-3">
        <span className="text-text-primary text-2xl font-bold">
          {t("game:playersJoined")}
          {totalPlayers}
        </span>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {playerList.map((player) => (
          // A stray click on a projected lobby used to remove a player on the
          // spot; kicking now always goes through a confirmation.
          <ConfirmDialog
            key={player.id}
            trigger={
              <button
                type="button"
                data-player-chip
                aria-label={t("game:kick.action", { name: player.username })}
                className="bg-brand text-on-accent rounded-rz-lg animate-rz-enter group flex items-center gap-2 px-4 py-3 text-3xl font-bold"
              >
                <span>{player.username}</span>
                <X
                  aria-hidden
                  className="ease-calm size-6 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-60"
                />
              </button>
            }
            title={t("game:kick.title")}
            description={t("game:kick.description", {
              name: player.username,
            })}
            confirmLabel={t("game:kick.confirm")}
            onConfirm={handleKick(player.id)}
          />
        ))}
      </div>
    </section>
  )
}

export default Room
