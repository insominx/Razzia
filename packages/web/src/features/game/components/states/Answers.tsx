import { EVENTS, MEDIA_TYPES, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { QuestionMediaType } from "@razzia/common/types/game"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { ANSWER_REVEAL_FADE_MS } from "@razzia/common/utils/answer-reveal"
import { answersSpec, score } from "@razzia/web/features/game/audio"
import AnswerTile, {
  type TileState,
} from "@razzia/web/features/game/components/AnswerTile"
import ChargeLine from "@razzia/web/features/game/components/ChargeLine"
import HudModule from "@razzia/web/features/game/components/HudModule"
import QuestionCard from "@razzia/web/features/game/components/QuestionCard"
import QuestionNumber from "@razzia/web/features/game/components/QuestionNumber"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useAnswerReveal } from "@razzia/web/features/game/hooks/use-answer-reveal"
import { useSceneArrival } from "@razzia/web/features/game/hooks/use-scene-arrival"
import { useSecondsUntil } from "@razzia/web/features/game/hooks/use-seconds-until"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useMoodOverride } from "@razzia/web/features/game/stores/mood"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import {
  ANSWER_GRID_TRACKS,
  answerSlotPlacement,
  FINAL_COUNTDOWN_SECONDS,
} from "@razzia/web/features/game/utils/game-constants"
import { HAPTIC, haptic } from "@razzia/web/features/game/utils/haptics"
import { revealSegment } from "@razzia/web/features/game/utils/charge-line"
import { answerVars } from "@razzia/web/features/game/utils/type-tier"
import clsx from "clsx"
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["SELECT_ANSWER"]
}

const SOUNDED_MEDIA: QuestionMediaType[] = [
  MEDIA_TYPES.AUDIO,
  MEDIA_TYPES.VIDEO,
]

const Answers = ({ data }: Props) => {
  const {
    questionNumber,
    question,
    answers,
    media,
    time,
    totalPlayer,
    answeringOpen,
    revealStartedAt,
    unlockAt,
    serverNow,
    cooldown: promptCooldown,
  } = data
  const { socket } = useSocket()
  const { player, gameId, setLastAnswer } = usePlayerStore()

  const [cooldown, setCooldown] = useState(time)
  const [totalAnswer, setTotalAnswer] = useState(0)
  // A reconnect can hand this mounted screen the next question: its count and
  // clock start over rather than showing the last question's.
  const [countedQuestion, setCountedQuestion] = useState(questionNumber)

  if (countedQuestion !== questionNumber) {
    setCountedQuestion(questionNumber)
    setCooldown(time)
    setTotalAnswer(0)
  }

  // Set on the tap itself: the press is felt before the server has answered.
  // It belongs to its question: a reconnect can land on the next one with this
  // screen still up, and an old pick must not lock (or answer) a new question.
  const [pick, setPick] = useState<{ key: number; question: number } | null>(
    null,
  )
  const pickedKey = pick?.question === questionNumber ? pick.key : null
  // The `serverNow` of the screen the pick was last sent from.
  const sentFrom = useRef<number | null>(null)
  const promptScroll = useRef<HTMLDivElement>(null)
  const visibleCount = useAnswerReveal(data)
  const { t } = useTranslation()
  // A reviewed question must not cut the live game's bed.
  const reviewing = useManagerStore((state) => state.review !== null)
  const arrived = useSceneArrival(serverNow)

  const timed = time !== NO_TIME_LIMIT
  const opensIn = useSecondsUntil(unlockAt, serverNow, !answeringOpen)
  const lastFive = answeringOpen && timed && cooldown <= FINAL_COUNTDOWN_SECONDS
  // The room runs warm for the last five seconds.
  useMoodOverride(lastFive ? "warm" : null)

  // Power-on, the drop on the unlock beat, the groove while answering and the
  // last five ticks are one scene, scheduled from the server's stamps. The same
  // call on every data change is a no-op, and a call when a review ends keeps
  // the scene on the clock it arrived with.
  // A question with its own sound (audio or video) keeps the bed out from under
  // it, as the answers loop always did; the taps and pops still play.
  useEffect(() => {
    if (media?.type && SOUNDED_MEDIA.includes(media.type)) {
      return
    }

    score.start(arrived(answersSpec(data)), { silent: reviewing })
  }, [data, media?.type, reviewing, arrived])

  // Only a phone has a seat; the projector shows the same tiles, untappable.
  const interactive = Boolean(player && gameId)

  const handleAnswer = (answerKey: number) => () => {
    if (!answeringOpen || !player || !gameId || pickedKey !== null) {
      return
    }

    setPick({ key: answerKey, question: questionNumber })
    sentFrom.current = serverNow

    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKey,
      },
    })
    setLastAnswer({ questionNumber, key: answerKey, text: answers[answerKey] })
    // Your own tap is felt and heard before the server has answered.
    score.cue({ cue: "pop", index: totalAnswer })
    haptic(HAPTIC.tap)
  }

  // A tap during a connection blip is sent when the connection comes back, but
  // before the phone has rejoined the game, so the server drops it. The server
  // then sends this screen again (a new `serverNow`) because it is still
  // waiting for this player: the pick goes again. It never counts twice, since
  // the server keeps one answer per player, and a pick it did take brings the
  // Locked-in screen, not this one.
  useEffect(() => {
    if (
      pickedKey === null ||
      !answeringOpen ||
      !gameId ||
      sentFrom.current === serverNow
    ) {
      return
    }

    sentFrom.current = serverNow
    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: { answerKey: pickedKey },
    })
  }, [pickedKey, answeringOpen, gameId, serverNow, socket])

  // On a phone the prompt scrolls above the pinned tiles; it rests on the end,
  // where the real question is.
  useEffect(() => {
    const scroller = promptScroll.current

    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight
    }
  }, [question])

  // The last seconds' ticks belong to the answers scene, scheduled with it.
  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    setCooldown(sec)
  })

  // Each answer that comes in is a note a step higher than the last.
  useEvent(EVENTS.GAME.PLAYER_ANSWER, (count) => {
    setTotalAnswer(count)
    score.cue({ cue: "pop", index: count })
  })

  const line = (() => {
    if (!answeringOpen) {
      return (
        <ChargeLine
          mode="grow"
          segment={revealSegment(promptCooldown, answers.length)}
          delayMs={-Math.max(0, serverNow - revealStartedAt)}
        />
      )
    }

    return timed ? (
      <ChargeLine
        mode="burn"
        answerSeconds={time}
        elapsedMs={Math.max(0, serverNow - unlockAt)}
      />
    ) : (
      <ChargeLine mode="lit" />
    )
  })()

  const tileState = (key: number): TileState => {
    if (pickedKey !== null) {
      return key === pickedKey ? "picked" : "faded"
    }

    return answeringOpen ? "active" : "locked"
  }

  return (
    <section className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="stage:max-w-[105rem] mx-auto flex min-h-0 w-full flex-1 flex-col">
        {/* The prompt: a scroller above the pinned tiles on a phone, and the
            projector's own zone (which must hold it) on the stage. */}
        <div
          ref={promptScroll}
          data-fit-box
          className="stage:overflow-visible stage:px-0 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4"
        >
          <div className="stage:gap-3 stage:py-0 my-auto flex w-full flex-col items-center gap-2 py-2">
            <QuestionNumber questionNumber={questionNumber} />
            <QuestionCard question={question} media={media} />
          </div>
        </div>

        {/* The clock, the count, and the line under them. The clock counts to
            the answers opening, then the time left; the count is how many are
            in. On a phone the line crosses the top of the screen instead. */}
        <div className="stage:grid stage:h-28 stage:grid-cols-[1fr_auto_1fr] stage:px-6 stage:pb-5 relative flex items-end justify-between px-4 pt-2 pb-2">
          <HudModule
            role="info"
            className={clsx(
              "stage:col-start-2 stage:items-center",
              answeringOpen && !timed && "invisible",
            )}
            label={t(answeringOpen ? "game:hud.time" : "game:hud.opensIn")}
            value={String(answeringOpen ? cooldown : opensIn)}
            urgent={lastFive}
          />

          <HudModule
            role="sequence"
            className="stage:col-start-3 stage:justify-self-end ml-auto items-end"
            label={t("game:hud.responses")}
            value={`${totalAnswer}/${totalPlayer}`}
          />

          {/* The tap is acknowledged on the spot, in the gap between the clock
              and the count, before the server's own Locked-in screen arrives. */}
          {interactive && pickedKey !== null && (
            <p
              data-locked-in-pill
              className="animate-rz-fade-in bg-success-tint border-success-border text-success absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border px-3 py-0.5 text-xs font-bold tracking-[0.12em] whitespace-nowrap uppercase"
            >
              {t("game:lockedIn")}
            </p>
          )}

          {line}
        </div>

        <div
          className={clsx(
            "stage:gap-4 stage:px-0 stage:pb-0 grid gap-2 px-3 pb-3",
            ANSWER_GRID_TRACKS.stage,
          )}
          style={
            {
              ...answerVars(answers),
              "--rz-answer-reveal-fade": `${ANSWER_REVEAL_FADE_MS}ms`,
            } as CSSProperties
          }
        >
          {answers.map((answer, key) => (
            <AnswerTile
              key={key}
              index={key}
              state={tileState(key)}
              className={clsx(
                answerSlotPlacement(key, answers.length),
                "rz-answer-slot",
                key < visibleCount && "rz-answer-slot-visible",
              )}
              onClick={interactive ? handleAnswer(key) : undefined}
              disabled={!answeringOpen || key >= visibleCount}
            >
              {answer}
            </AnswerTile>
          ))}
        </div>

        {/* Heads in the front rows hide the bottom 8% of the projected frame. */}
        <div
          aria-hidden="true"
          className="stage:block stage:h-[5.4rem] hidden"
        />
      </div>
    </section>
  )
}

export default Answers
