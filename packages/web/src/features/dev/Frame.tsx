import type { ShowIntensity } from "@razzia/common/types/visuals"
import {
  type DirectorApi,
  publishDirector,
} from "@razzia/web/features/dev/director-api"
import { type FitView, measureDocument } from "@razzia/web/features/dev/fit"
import {
  findQuiz,
  type FixtureRef,
  pickFor,
  statusFor,
} from "@razzia/web/features/dev/fixtures"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { createFakeSocket } from "@razzia/web/features/rehearse/fake-socket"
import FrameStage, {
  type FrameMotion,
  type FrameSeed,
} from "@razzia/web/features/rehearse/FrameStage"
import type { GameStatus } from "@razzia/web/features/rehearse/screens"
import type { Surface, SurfaceDialect } from "@razzia/web/hooks/use-surface"
import { useLayoutEffect, useMemo, useState } from "react"
import { flushSync } from "react-dom"

export type { FrameMotion }

const SETTLE_MS = 80

interface Props {
  view: FitView
  initial: FixtureRef
  dialect: SurfaceDialect
  surface: Surface
  motion?: FrameMotion
  /** How big the show is, as the Visuals tab would set it for the game. */
  intensity?: ShowIntensity
}

const progressOf = (ref: FixtureRef) => ({
  current: ref.question + 1,
  total: findQuiz(ref.quizId)?.quiz.questions.length ?? 1,
})

/** A phone on the locked-in screen has already tapped a tile. */
const seedPick = (ref: FixtureRef) => {
  const pick = pickFor(ref)

  if (pick) {
    usePlayerStore.getState().setLastAnswer(pick)
  }
}

/**
 * The Director's frame: `FrameStage` showing a screen of a real quiz, plus the
 * API the Director drives it with (show another screen, deliver a socket event,
 * measure the layout).
 */
const Frame = ({
  view,
  initial,
  dialect,
  surface,
  motion = "on",
  intensity = "full",
}: Props) => {
  const fake = useMemo(() => createFakeSocket(), [])
  const [shown, setShown] = useState<{ status: GameStatus; mount: number }>(
    () => ({ status: statusFor(initial), mount: 0 }),
  )
  const [seed] = useState<FrameSeed>(() => ({
    progress: progressOf(initial),
    pick: pickFor(initial),
  }))

  useLayoutEffect(() => {
    const api: DirectorApi = {
      showFixture: (ref) => {
        useQuestionStore.getState().setQuestionStates(progressOf(ref))
        seedPick(ref)
        flushSync(() =>
          setShown((previous) => ({
            status: statusFor(ref),
            mount: previous.mount + 1,
          })),
        )
      },
      showStatus: (status) => {
        flushSync(() =>
          setShown((previous) => ({ status, mount: previous.mount })),
        )
      },
      deliver: (event, ...args) => {
        flushSync(() => fake.deliver(event, ...args))
      },
      onEmit: fake.onEmit,
      // A timer, not requestAnimationFrame: a frame that is scaled away or
      // scrolled out of sight stops getting animation frames.
      settle: async () => {
        await document.fonts.ready
        await new Promise<void>((resolve) => {
          setTimeout(resolve, SETTLE_MS)
        })
      },
      measure: () => {
        window.scrollTo(0, 0)

        return measureDocument(document, window)
      },
    }

    publishDirector(window, api)

    return () => {
      publishDirector(window, null)
    }
  }, [fake])

  return (
    <FrameStage
      view={view}
      dialect={dialect}
      surface={surface}
      motion={motion}
      intensity={intensity}
      status={shown.status}
      mount={shown.mount}
      fake={fake}
      seed={seed}
    />
  )
}

export default Frame
