import { IS_DECK_EMBED } from "@razzia/web/features/deck/embed"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import HostPollLauncher from "@razzia/web/features/poll/components/HostPollLauncher"
import HostPollOverlay from "@razzia/web/features/poll/components/HostPollOverlay"
import PlayerPollOverlay from "@razzia/web/features/poll/components/PlayerPollOverlay"
import { usePollLane } from "@razzia/web/features/poll/hooks/use-poll-lane"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import clsx from "clsx"
import type { ReactNode } from "react"

interface Props {
  role: "player" | "host"
  children: ReactNode
}

/**
 * Where a game page takes a poll. The page's own screens go inside; while a
 * poll is showing they are made inert, so nothing under it can be tapped or
 * reached by keyboard (a stray Enter on Next would only wait for an answer
 * the server will not give), and the poll's screen sits above them. Nothing of
 * the quiz moves: its screens, statuses and stores are never touched.
 *
 * In a deck's frame the poll's screen is clear so the slide shows through, and
 * the quiz screen under it (the lobby, with its PIN, QR code and every player's
 * name) would show through the poll's text. There it is hidden as well as
 * inert, and stays mounted, so the quiz's own state is not touched.
 */
const PollShell = ({ role, children }: Props) => {
  const playerGameId = usePlayerStore((state) => state.gameId)
  const hostGameId = useManagerStore((state) => state.gameId)
  const lecture = useManagerStore((state) => state.lecture)
  // A result shown again covers the stage too (a deck's frame only).
  const showing = usePollStore(
    (state) => state.snapshot !== null || state.review !== null,
  )
  const hidden = showing && IS_DECK_EMBED

  // A poll runs only in a lecture room, so a host page asks only in one.
  let gameId: string | null = null

  if (role === "player") {
    gameId = playerGameId
  } else if (lecture) {
    gameId = hostGameId
  }

  usePollLane(gameId)

  return (
    <>
      <div
        className={clsx("contents", hidden && "invisible")}
        inert={showing}
        data-poll-hides-quiz={hidden ? "" : undefined}
      >
        {children}
      </div>

      {role === "player" ? (
        <PlayerPollOverlay />
      ) : (
        <>
          <HostPollOverlay />
          <HostPollLauncher />
        </>
      )}
    </>
  )
}

export default PollShell
