import * as AlertDialog from "@radix-ui/react-alert-dialog"
import { EVENTS } from "@razzia/common/constants"
import type { PublicPlayer } from "@razzia/common/types/game"
import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import ConfirmDialog from "@razzia/web/components/AlertDialog"
import { score } from "@razzia/web/features/game/audio"
import FlapPin from "@razzia/web/features/game/components/FlapPin"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import {
  seatsFor,
  seatTier,
  shortUrl,
} from "@razzia/web/features/game/utils/lobby"
import { useOnClickOutside } from "@razzia/web/hooks/useOnClickOutside"
import clsx from "clsx"
import { Maximize2, X } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  data: ManagerStatusDataMap["SHOW_ROOM"]
}

/**
 * The lobby as a live board: the address and PIN to join, a QR code, and a seat
 * for every player that turns solid as their name flips in. Up to sixty seats
 * are drawn; past that the rest are counted.
 */
const Room = ({ data: { text, inviteCode } }: Props) => {
  const { gameId } = useManagerStore()
  const { socket } = useSocket()
  const webUrl = window.location.origin
  const { players } = useManagerStore()
  const [playerList, setPlayerList] = useState<PublicPlayer[]>(players)
  // Phones can join faster than this screen renders: several events can arrive
  // before the next render. So the handlers work from this, which every event
  // keeps current, and never from `playerList`.
  const seatedRef = useRef(players)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [qrOpen, setQrOpen] = useState(false)
  const qrContentRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()

  // A low bed for as long as the room is filling; each join plays a note a
  // step higher than the last.
  useEffect(() => {
    score.start({ scene: "lobby" })
  }, [])

  useOnClickOutside({ ref: qrContentRef, handler: () => setQrOpen(false) })

  const updateSeated = (seated: PublicPlayer[]) => {
    seatedRef.current = seated
    setPlayerList(seated)
  }

  const handlePlayerGone = (playerId: string) => {
    updateSeated(seatedRef.current.filter((p) => p.id !== playerId))
  }

  useEvent(EVENTS.MANAGER.NEW_PLAYER, (player) => {
    score.cue({ cue: "join", index: seatedRef.current.length })
    updateSeated([...seatedRef.current, player])
  })

  useEvent(EVENTS.MANAGER.REMOVE_PLAYER, handlePlayerGone)

  useEvent(EVENTS.MANAGER.PLAYER_KICKED, handlePlayerGone)

  // A host that reconnects is handed the server's whole list while this screen
  // stays mounted (a lecture lobby survives its host dropping). Phones that
  // joined during the gap are in that list and in no join event. Take the list
  // from the event itself, not from the store after a render, so it lands in
  // order with the joins around it and a join right after it is kept.
  useEvent(EVENTS.MANAGER.SUCCESS_RECONNECT, ({ players: serverList }) => {
    updateSeated(serverList)
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

  const { shown, more, empty } = seatsFor(playerList)
  const tier = seatTier(playerList.length)
  const qrValue = `${webUrl}?pin=${inviteCode}`

  return (
    <section className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col items-center justify-center gap-10 px-4 pb-[5.4rem] lg:flex-row lg:items-center lg:gap-16">
      {/* How to get in: address, PIN, and the code to scan. */}
      <div
        data-lobby-join
        className="flex shrink-0 flex-col items-center gap-5 lg:w-[48rem]"
      >
        <p className="text-text-muted stage:text-4xl text-2xl font-bold">
          {t("game:joinInstruction")}
        </p>
        <p
          data-join-url
          className="text-text-primary stage:text-6xl text-3xl font-extrabold break-all"
        >
          {shortUrl(webUrl)}
        </p>

        <p className="text-text-muted stage:text-4xl mt-2 text-2xl font-bold">
          {t("game:gamePinLabel")}
        </p>
        <FlapPin
          code={inviteCode ?? ""}
          className="stage:text-[7.5rem] text-6xl"
        />

        <AlertDialog.Root open={qrOpen} onOpenChange={setQrOpen}>
          <AlertDialog.Trigger asChild>
            {/* Scanned from seats across the room, so it grows with the screen. */}
            <div className="bg-surface border-border rounded-rz-lg group stage:h-[22rem] relative mt-3 flex h-44 shrink-0 cursor-pointer border p-3">
              <QRCodeSVG
                className="h-auto w-auto"
                bgColor="#ffffff"
                fgColor="#000000"
                value={qrValue}
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
                className="stage:size-[40rem] size-56 md:size-70"
                bgColor="#ffffff"
                fgColor="#000000"
                value={qrValue}
              />
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>

      {/* Who is in: one seat each, then a count for any past sixty. */}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-5 lg:items-stretch">
        <div className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-2 lg:justify-between">
          <h2 className="text-text-primary stage:text-5xl text-3xl font-bold">
            {t(text)}
          </h2>
          <span
            data-players-joined
            className="text-text-body stage:text-4xl text-2xl font-bold"
          >
            {t("game:playersJoined")}
            {Math.max(totalPlayers, playerList.length)}
          </span>
        </div>

        <div
          data-seats
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${tier.minRem}rem, 1fr))`,
          }}
        >
          {shown.map((player) => (
            // A stray click on a projected lobby used to remove a player on the
            // spot; kicking now always goes through a confirmation.
            <ConfirmDialog
              key={player.id}
              trigger={
                <button
                  type="button"
                  data-player-chip
                  aria-label={t("game:kick.action", { name: player.username })}
                  className={clsx(
                    "bg-brand text-on-accent rounded-rz-lg rz-seat-in group flex min-w-0 items-center gap-2 font-bold",
                    tier.pad,
                    tier.text,
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {player.username}
                  </span>
                  <X
                    aria-hidden
                    className="ease-calm size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-60"
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

          {Array.from({ length: empty }, (_, index) => (
            <div
              key={`empty-${index}`}
              data-seat-empty
              aria-hidden="true"
              className={clsx(
                "border-border rounded-rz-lg border-2 border-dashed font-bold opacity-60",
                tier.pad,
                tier.text,
              )}
            >
              <span className="invisible">·</span>
            </div>
          ))}
        </div>

        {more > 0 && (
          <p
            data-seats-more
            className="text-text-body stage:text-4xl text-center text-3xl font-bold"
          >
            {t("game:seatsMore", { count: more })}
          </p>
        )}
      </div>
    </section>
  )
}

export default Room
