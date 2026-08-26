import { EVENTS, MEDIA_TYPES, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { QuestionMediaType } from "@razzia/common/types/game"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { ANSWER_REVEAL_FADE_MS } from "@razzia/common/utils/answer-reveal"
import AnswerButton from "@razzia/web/features/game/components/AnswerButton"
import DotField from "@razzia/web/features/game/components/DotField"
import HudModule from "@razzia/web/features/game/components/HudModule"
import QuestionCard from "@razzia/web/features/game/components/QuestionCard"
import QuestionNumber from "@razzia/web/features/game/components/QuestionNumber"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useSfx } from "@razzia/web/features/game/hooks/use-sfx"
import { useAnswerReveal } from "@razzia/web/features/game/hooks/use-answer-reveal"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import {
  ANSWER_IDENTITY,
  ANSWER_INK,
  ANSWERS_LABELS,
  SFX,
} from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { type CSSProperties, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SELECT_ANSWER"]
}

const Answers = ({ data }: Props) => {
  const {
    questionNumber,
    question,
    answers,
    media,
    time,
    totalPlayer,
    answeringOpen,
  } = data
  const { socket } = useSocket()
  const { player, gameId } = usePlayerStore()

  const [cooldown, setCooldown] = useState(time)
  const [totalAnswer, setTotalAnswer] = useState(0)
  const visibleCount = useAnswerReveal(data)
  const { t } = useTranslation()
  const sfx = useSfx()

  const [sfxPop] = useSound(sfx(SFX.ANSWERS.SOUND), {
    volume: 0.1,
  })

  const [playMusic, { stop: stopMusic }] = useSound(sfx(SFX.ANSWERS.MUSIC), {
    volume: 0.2,
    interrupt: true,
    loop: true,
  })

  const handleAnswer = (answerKey: number) => () => {
    if (!answeringOpen || !player || !gameId) {
      return
    }

    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey,
      },
    })
    sfxPop()
  }

  useEffect(() => {
    const disabledMusicMedia = [
      MEDIA_TYPES.AUDIO,
      MEDIA_TYPES.VIDEO,
    ] as QuestionMediaType[]

    if (!answeringOpen || disabledMusicMedia.includes(media?.type)) {
      return
    }

    playMusic()

    return () => {
      stopMusic()
    }
  }, [answeringOpen, media?.type, playMusic, stopMusic])

  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    setCooldown(sec)
  })

  useEvent(EVENTS.GAME.PLAYER_ANSWER, (count) => {
    setTotalAnswer(count)
    sfxPop()
  })

  const timed = time !== NO_TIME_LIMIT

  return (
    // Full-bleed so the dot fields can sit in the gutter beside the content
    // column; the clip hides them entirely once the viewport has no gutter.
    <section className="relative flex h-full w-full flex-1 flex-col overflow-x-clip">
      <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4">
        <DotField side="left" />
        <DotField side="right" />

        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <QuestionNumber questionNumber={questionNumber} />
          <QuestionCard question={question} media={media} />
        </div>

        <div className="flex items-end justify-between">
          {timed && (
            <HudModule
              role="info"
              className={clsx(!answeringOpen && "invisible")}
              label={t("game:hud.time")}
              value={String(cooldown)}
              countdown={{ remaining: cooldown, total: time }}
            />
          )}

          <HudModule
            role="sequence"
            className="ml-auto"
            label={t("game:hud.responses")}
            value={`${totalAnswer} / ${totalPlayer}`}
          />
        </div>

        <div
          className="mb-4 grid grid-cols-1 gap-3 text-lg font-bold sm:grid-cols-2 md:gap-4 md:text-xl"
          style={
            {
              "--rz-answer-reveal-fade": `${ANSWER_REVEAL_FADE_MS}ms`,
            } as CSSProperties
          }
        >
          {answers.map((answer, key) => (
            <AnswerButton
              key={key}
              className={clsx(
                ANSWER_INK[key],
                "rz-answer-slot",
                key < visibleCount && "rz-answer-slot-visible",
              )}
              data-answer-state={answeringOpen ? "active" : "revealing"}
              surface={{
                className: ANSWER_IDENTITY[key],
                state: answeringOpen ? "active" : "locked",
              }}
              label={ANSWERS_LABELS[key]}
              onClick={handleAnswer(key)}
              disabled={!answeringOpen || key >= visibleCount}
            >
              {answer}
            </AnswerButton>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Answers
