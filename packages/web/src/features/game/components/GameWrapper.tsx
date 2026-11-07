import { EVENTS } from "@razzia/common/constants"
import type { Status } from "@razzia/common/types/game/status"
import Atmosphere from "@razzia/web/components/Atmosphere"
import Button from "@razzia/web/components/Button"
import Loader from "@razzia/web/components/Loader"
import LectureJoinHint from "@razzia/web/features/game/components/LectureJoinHint"
import VolumeControl from "@razzia/web/features/game/components/VolumeControl"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import {
  useCalmVisuals,
  useShowIntensity,
} from "@razzia/web/features/game/hooks/use-show-intensity"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import {
  moodForStatus,
  useMoodStore,
} from "@razzia/web/features/game/stores/mood"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import {
  score,
  useScoreConfig,
  useScoreRound,
} from "@razzia/web/features/game/audio"
import { useSoundTheme } from "@razzia/web/features/game/hooks/use-sfx"
import { useSoundStore } from "@razzia/web/features/game/stores/sound"
import { MANAGER_SKIP_BTN } from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { LayoutGroup } from "motion/react"
import {
  type PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useState,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

type Props = PropsWithChildren & {
  statusName: Status | undefined
  backgroundUrl?: string
  onNext?: () => void
  onBack?: () => void
  manager?: boolean
  nextActionKey?: string | null
}

const GameWrapper = ({
  children,
  statusName,
  backgroundUrl,
  onNext,
  onBack,
  manager,
  nextActionKey,
}: Props) => {
  const { player } = usePlayerStore()
  const { setQuestionStates } = useQuestionStore()
  const questionStates = useQuestionStore((state) => state.questionStates)
  const intensity = useShowIntensity()
  const theme = useSoundTheme()
  const { t } = useTranslation()
  const { isConnected } = useSocket()
  const moodOverride = useMoodStore((state) => state.override)
  const calm = useCalmVisuals()
  const [isDisabled, setIsDisabled] = useState(false)
  const next = statusName ? MANAGER_SKIP_BTN[statusName] : null
  const hostControls = useManagerStore((state) => state.hostControls)
  const controls = manager && hostControls

  useLayoutEffect(() => {
    useSoundStore.getState().bindSurface(manager ? "manager" : "player")
  }, [manager])

  // The score follows this session's pack, intensity and round, and stops with
  // the game: leaving the page must not leave a bed playing.
  useScoreConfig({ intensity, theme, surface: manager ? "host" : "player" })
  useScoreRound(questionStates?.current ?? 1, questionStates?.total ?? 0)

  useEffect(
    () => () => {
      score.stop()
    },
    [],
  )

  useEvent(EVENTS.GAME.UPDATE_QUESTION, ({ current, total }) => {
    setQuestionStates({
      current,
      total,
    })
  })

  useEvent(EVENTS.GAME.ERROR_MESSAGE, (message) => {
    toast.error(t(message))
    console.log(t(message))
    setIsDisabled(false)
  })

  useEffect(() => {
    setIsDisabled(false)
  }, [nextActionKey, statusName])

  const handleNext = () => {
    setIsDisabled(true)
    onNext?.()
  }

  return (
    // A phone is one screen tall, so the tiles stay pinned and only the prompt
    // scrolls. The stage grows instead, so a layout that does not fit shows up
    // as a page that scrolls (and as a failure in the Director's fit report).
    <section className="stage:h-auto stage:min-h-dvh relative flex h-dvh">
      <Atmosphere
        recipe="photo"
        backgroundUrl={backgroundUrl}
        mood={moodOverride ?? moodForStatus(statusName)}
        calm={calm}
      />

      <div className="z-10 flex min-h-0 w-full flex-1 flex-col justify-between">
        {!statusName ? (
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
            <Loader className="h-30" />
            <h1 className="text-text-primary text-4xl font-bold">
              {t("common:connecting")}
            </h1>
          </div>
        ) : (
          <>
            {/* On the stage the controls float over the corners: they are for
                the teacher, and the room's frame belongs to the question. */}
            <div className="stage:absolute stage:inset-x-0 stage:top-0 stage:z-20 flex w-full items-center gap-2 p-4">
              <div className="flex flex-1 items-center justify-between">
                {controls && next && (
                  <Button
                    className={clsx(
                      "bg-surface border-border text-text-primary hover:bg-panel border px-4",
                      {
                        "pointer-events-none": isDisabled,
                      },
                    )}
                    onClick={handleNext}
                  >
                    {t(next)}
                  </Button>
                )}

                {controls && <LectureJoinHint statusName={statusName} />}

                {controls && onBack && (
                  <Button
                    onClick={onBack}
                    className="bg-surface border-border text-text-primary hover:bg-panel border px-4"
                  >
                    {t("common:exit")}
                  </Button>
                )}
              </div>

              <VolumeControl />
            </div>

            {!isConnected && (
              <p
                role="status"
                className="bg-warning text-on-accent stage:top-4 stage:px-6 stage:py-2 stage:text-[1.5rem] absolute top-3 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-bold"
              >
                {t("common:reconnecting")}
              </p>
            )}

            <LayoutGroup id={manager ? "manager-game" : "player-game"}>
              {children}
            </LayoutGroup>

            {!manager && (
              <div className="bg-panel/70 border-border text-text-body z-50 flex items-center justify-between border-t px-4 py-2 text-lg font-bold">
                <p className="text-text-muted">{player?.username}</p>
                <div className="bg-panel border-border text-text-primary rounded-rz-md border px-3 py-1 font-mono text-lg">
                  {player?.points}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default GameWrapper
