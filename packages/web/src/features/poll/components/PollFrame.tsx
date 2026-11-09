import Atmosphere from "@razzia/web/components/Atmosphere"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useCalmVisuals } from "@razzia/web/features/game/hooks/use-show-intensity"
import { type ReactNode, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  backgroundUrl?: string
  // The id of the element that names this dialog, for screen readers.
  labelledBy: string
  // In a deck's frame the deck drives the room, so keys pressed inside this
  // dialog still go to the deck (see `toForwardedKey`).
  deckKeys?: boolean
  children: ReactNode
}

/**
 * The screen a poll takes over: the show's own light behind it, above the quiz
 * screen it covers and below the host's own dialogs (z-50), such as the one
 * that asks before leaving the room.
 */
const PollFrame = ({
  backgroundUrl,
  labelledBy,
  deckKeys = false,
  children,
}: Props) => {
  const calm = useCalmVisuals()
  const { isConnected } = useSocket()
  const { t } = useTranslation()
  const frame = useRef<HTMLDivElement>(null)

  // The quiz screen underneath is inert; focus starts here.
  useEffect(() => {
    frame.current?.focus()
  }, [])

  return (
    <div
      ref={frame}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-poll-frame
      data-deck-keys={deckKeys ? "" : undefined}
      tabIndex={-1}
      className="animate-rz-fade-in bg-canvas fixed inset-0 z-40 flex flex-col outline-none"
    >
      <Atmosphere
        recipe="photo"
        backgroundUrl={backgroundUrl}
        mood="cool"
        calm={calm}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {children}
      </div>

      {!isConnected && (
        <p
          role="status"
          className="bg-warning text-on-accent stage:top-4 stage:px-6 stage:py-2 stage:text-[1.5rem] absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-bold"
        >
          {t("common:reconnecting")}
        </p>
      )}
    </div>
  )
}

export default PollFrame
