import type { DirectorApi } from "@razzia/web/features/dev/director-api"
import { Button } from "@razzia/web/features/dev/director-ui"
import { FIT_SIZES } from "@razzia/web/features/dev/fit"
import FrameView from "@razzia/web/features/dev/FrameView"
import {
  type CrowdMode,
  findQuiz,
  statusFor,
} from "@razzia/web/features/dev/fixtures"
import { milestonesOf, planRound } from "@razzia/web/features/dev/round"
import type { DirectorState } from "@razzia/web/features/dev/settings"
import { useRoundRunner } from "@razzia/web/features/dev/use-round-runner"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

interface Props {
  state: DirectorState
  onQuestion: (question: number) => void
}

// The first projector size and the first phone size of the fit matrix.
const [HOST_SIZE, , PHONE_SIZE] = FIT_SIZES

const seconds = (ms: number) => `${(ms / 1_000).toFixed(1)} s`

/**
 * One real question played end to end on a projector frame and a phone frame,
 * through the screens the app really has. The host's Skip and Next work, and a
 * tap on the phone is answered as the server would answer it.
 */
const RoundTab = ({ state, onQuestion }: Props) => {
  const [crowd, setCrowd] = useState<CrowdMode>("right")
  const [host, setHost] = useState<DirectorApi | null>(null)
  const [phone, setPhone] = useState<DirectorApi | null>(null)
  const quiz = findQuiz(state.quizId)?.quiz
  const last = (quiz?.questions.length ?? 1) - 1

  const steps = useMemo(
    () => (quiz ? planRound({ quiz, question: state.question, crowd }) : []),
    [quiz, state.question, crowd],
  )

  // Next on the leaderboard moves to the next question and plays it at once.
  const autoplay = useRef(false)
  const onNextQuestion = useCallback(() => {
    if (state.question >= last) {
      // Last question: the server ends the game on the podium.
      host?.showStatus(
        statusFor({ fixture: "podium", quizId: state.quizId, question: 0 }),
      )
      phone?.showStatus(
        statusFor({ fixture: "finished", quizId: state.quizId, question: 0 }),
      )

      return
    }

    autoplay.current = true
    onQuestion(state.question + 1)
  }, [host, last, onQuestion, phone, state.question, state.quizId])

  const runner = useRoundRunner({ steps, host, phone, onNextQuestion })
  const { play, stop } = runner

  // A different question or crowd means a different round: stop the old one,
  // unless the host just asked for exactly that.
  useEffect(() => {
    if (autoplay.current) {
      autoplay.current = false
      play()
    } else {
      stop()
    }
  }, [steps, play, stop])

  const milestones = milestonesOf(steps)
  const shown = milestones.find((step) => step.id === runner.current)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          active={runner.running}
          onClick={play}
          disabled={!host || !phone}
        >
          {runner.running ? "Restart round" : "Play round"}
        </Button>
        <Button onClick={stop} disabled={!runner.running}>
          Stop
        </Button>
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Crowd</legend>
          <span className="text-text-muted text-xs font-bold tracking-widest uppercase">
            Crowd
          </span>
          {(["right", "wrong"] as const).map((mode) => (
            <Button
              key={mode}
              active={crowd === mode}
              onClick={() => setCrowd(mode)}
            >
              {mode === "right" ? "Gets it right" : "Gets it wrong"}
            </Button>
          ))}
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-text-muted text-xs font-bold tracking-widest uppercase">
          Jump to
        </span>
        {milestones.map((step) => (
          <Button
            key={step.id}
            active={runner.current === step.id}
            disabled={!host || !phone}
            onClick={() => runner.jumpTo(step.id)}
          >
            {step.label}
          </Button>
        ))}
        {shown && (
          <span className="text-text-muted ml-auto font-mono text-xs">
            {`${shown.label} · t = ${seconds(shown.at)}`}
          </span>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <FrameView
          view="host"
          label="Projector"
          size={HOST_SIZE}
          fixture={{
            fixture: "room",
            quizId: state.quizId,
            question: state.question,
          }}
          dialect={state.dialect}
          surface={state.surface}
          intensity={state.intensity}
          room={state.room}
          onApi={setHost}
        />
        <FrameView
          view="phone"
          label="Phone"
          size={PHONE_SIZE}
          fixture={{
            fixture: "wait",
            quizId: state.quizId,
            question: state.question,
          }}
          dialect={state.dialect}
          surface={state.surface}
          intensity={state.intensity}
          room={state.room}
          onApi={setPhone}
        />
      </div>

      <section
        aria-label="Round log"
        className="border-border bg-panel rounded-md border p-3"
      >
        <h3 className="text-text-muted mb-2 text-xs font-bold tracking-widest uppercase">
          What the server sent
        </h3>
        {runner.log.length === 0 ? (
          <p className="text-text-faint text-sm">
            Play the round, or tap an answer on the phone once answers open. The
            host&rsquo;s Skip and Next buttons work.
          </p>
        ) : (
          <ol className="max-h-48 overflow-auto font-mono text-xs">
            {runner.log.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span className="text-text-faint w-16 shrink-0 text-right">
                  {seconds(entry.at)}
                </span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-text-faint text-xs">
        Timings are the server&rsquo;s own: the number card, the prompt, the
        cooldown, the answer reveal and the answering window. Reading and
        answering run at real speed; use Jump to skip them.
      </p>
    </div>
  )
}

export default RoundTab
