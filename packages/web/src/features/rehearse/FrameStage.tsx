import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import type { PublicPlayer } from "@razzia/common/types/game"
import type { ShowIntensity } from "@razzia/common/types/visuals"
import GameWrapper from "@razzia/web/features/game/components/GameWrapper"
import {
  SocketContext,
  type SocketContextValue,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import {
  GAME_STATE_COMPONENTS,
  GAME_STATE_COMPONENTS_MANAGER,
  getManagerSkipEvent,
  isKeyOf,
} from "@razzia/web/features/game/utils/constants"
import type { FakeSocket } from "@razzia/web/features/rehearse/fake-socket"
import {
  type GameStatus,
  PHONE_PLAYER,
  PLAYERS,
  type ScreenView,
} from "@razzia/web/features/rehearse/screens"
import {
  type Surface,
  type SurfaceDialect,
  useSurfaceOverride,
} from "@razzia/web/hooks/use-surface"
import { MotionConfig } from "motion/react"
import { useLayoutEffect, useMemo, useState } from "react"

const FRAME_GAME_ID = "dev-frame"

const noop = () => {
  /* A frame never connects. */
}

/**
 * "off" is for measuring: layout transitions snap and nothing morphs in from
 * the previous screen, so a screen is read at rest rather than mid-transition.
 */
export type FrameMotion = "on" | "off"

export interface FrameSeed {
  /** Where the quiz is, for "Question 4 of 6". */
  progress: { current: number; total: number }
  /** What a phone that has already tapped a tile picked. */
  pick: { questionNumber: number; key: number; text: string } | null
  /** Who is in the room; three players when left out. */
  players?: readonly PublicPlayer[]
}

interface Props {
  view: ScreenView
  dialect: SurfaceDialect
  surface: Surface
  motion?: FrameMotion
  /** How big the show is, as the Visuals tab would set it for the game. */
  intensity?: ShowIntensity
  status: GameStatus
  /**
   * A new value remounts the whole screen, as a page load would; the same one
   * keeps it, so a live status updates in place.
   */
  mount: number
  fake: FakeSocket
  /** Read when the frame mounts or its view or intensity changes. */
  seed: FrameSeed
}

/**
 * One game screen, composed as the real host or phone page composes it
 * (`GameWrapper` around the state component), driven by a fake socket and
 * seeded as a seat in a game. It is meant to run inside an iframe of an exact
 * size, so media queries, `dvh` and scrollbars behave as they do on the
 * projector or the phone.
 */
const FrameStage = ({
  view,
  dialect,
  surface,
  motion = "on",
  intensity = "full",
  status,
  mount,
  fake,
  seed,
}: Props) => {
  useSurfaceOverride({ dialect, surface, stage: view === "host" })

  const socketValue = useMemo<SocketContextValue>(
    () => ({
      socket: fake.socket,
      isConnected: true,
      clientId: FRAME_GAME_ID,
      connect: noop,
      disconnect: noop,
      reconnect: noop,
    }),
    [fake],
  )

  // The screens read the seat they play as, and the room's players, from the
  // stores when they first render, so they are not drawn until these are seeded.
  // The effect runs before the first paint and its state change renders at once.
  const [seeded, setSeeded] = useState(false)

  useLayoutEffect(() => {
    // Only a phone has a seat; the projector does not play.
    if (view === "phone") {
      usePlayerStore.getState().setPlayer({ ...PHONE_PLAYER })
      usePlayerStore.getState().setGameId(FRAME_GAME_ID)
      usePlayerStore.getState().setVisuals({ showIntensity: intensity })
    }

    useManagerStore.getState().setVisuals({ showIntensity: intensity })
    useManagerStore.getState().setPlayers([...(seed.players ?? PLAYERS)])
    useQuestionStore.getState().setQuestionStates(seed.progress)

    if (seed.pick) {
      usePlayerStore.getState().setLastAnswer(seed.pick)
    }

    setSeeded(true)

    return () => {
      usePlayerStore.getState().reset()
      useManagerStore.getState().reset()
      useQuestionStore.getState().setQuestionStates(null)
    }
    // The seed only starts the frame; later screens go through its owner.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [view, intensity])

  // A phone's scrollbar floats over the page, but a desktop iframe's takes 15 px
  // of its width whenever the page overflows, wrapping text a real phone would
  // not. Phones overflow often, so the frame hides its scrollbar.
  useLayoutEffect(() => {
    if (view !== "phone") {
      return
    }

    const root = document.documentElement

    root.style.scrollbarWidth = "none"

    return () => {
      root.style.scrollbarWidth = ""
    }
  }, [view])

  if (!seeded) {
    return null
  }

  const host = view === "host"
  const components = host
    ? GAME_STATE_COMPONENTS_MANAGER
    : GAME_STATE_COMPONENTS
  const Current = isKeyOf(components, status.name)
    ? components[status.name]
    : null
  const nextAction = host ? getManagerSkipEvent(status) : null
  const screen = Current ? (
    <Current data={status.data as never} />
  ) : (
    <p className="text-text-muted m-auto p-8 text-xl">
      {`${status.name} has no ${view} screen.`}
    </p>
  )

  return (
    <SocketContext.Provider value={socketValue}>
      <MotionConfig reducedMotion={motion === "off" ? "always" : "user"}>
        <GameWrapper
          // Motion's shared-layout registry outlives a remount, so the question
          // card can still morph in from the previous screen: a frame that is
          // measured runs with `motion="off"` for that reason.
          key={mount}
          statusName={status.name}
          manager={host}
          onNext={() => {
            if (nextAction) {
              fake.emit(nextAction, { gameId: FRAME_GAME_ID })
            }
          }}
          nextActionKey={nextAction}
          onBack={
            host && status.name === STATUS.SHOW_ROOM
              ? () => fake.emit(EVENTS.MANAGER.LEAVE, { gameId: FRAME_GAME_ID })
              : undefined
          }
        >
          {host ? (
            <div data-live-screen className="contents">
              {screen}
            </div>
          ) : (
            screen
          )}
        </GameWrapper>
      </MotionConfig>
    </SocketContext.Provider>
  )
}

export default FrameStage
