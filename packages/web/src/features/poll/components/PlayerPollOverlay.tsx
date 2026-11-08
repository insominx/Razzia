import { EVENTS } from "@razzia/common/constants"
import type { PollVoteOutcome } from "@razzia/common/types/poll"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import PollBars from "@razzia/web/features/poll/components/PollBars"
import PollFrame from "@razzia/web/features/poll/components/PollFrame"
import { usePollStore } from "@razzia/web/features/poll/stores/poll"
import { emitWithAck } from "@razzia/web/features/poll/utils/emit-with-ack"
import { LETTERS } from "@razzia/web/features/poll/utils/letters"
import {
  OPTION_CLASSES,
  optionTier,
  QUESTION_CLASSES,
  questionTier,
} from "@razzia/web/features/poll/utils/type-tier"
import clsx from "clsx"
import { Check } from "lucide-react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const QUESTION_ID = "poll-question"

/**
 * A phone's poll, over whatever quiz screen it was on. A tap is the vote and
 * shows at once; tapping another option moves it, until the host closes the
 * poll and everyone sees the result.
 */
const PlayerPollOverlay = () => {
  const snapshot = usePollStore((state) => state.snapshot)
  const gameId = usePlayerStore((state) => state.gameId)
  const backgroundUrl = usePlayerStore((state) => state.visuals.backgroundUrl)
  const { socket } = useSocket()
  const { t } = useTranslation()

  if (!snapshot) {
    return null
  }

  const { pollId, question, options, anonymous, phase } = snapshot
  const mine = snapshot.mine ?? null
  const closed = phase === "closed"
  const tier = optionTier(options)

  const vote = async (option: number) => {
    const current = usePollStore.getState().snapshot

    if (!gameId || current?.phase !== "open" || current.mine === option) {
      return
    }

    const before = current.mine ?? null
    // On the tap itself, before the server has answered.
    usePollStore.getState().setMine(option)

    const outcome = await emitWithAck<PollVoteOutcome>((ack) => {
      socket.emit(EVENTS.POLL.VOTE, { gameId, pollId, option }, ack)
    })

    if (outcome === "accepted" || outcome === "unchanged") {
      return
    }

    // The poll closing is told to everyone; anything else is a vote that did
    // not land. Put the pick back unless the player has already tapped again,
    // and ask the server what it really holds.
    if (outcome !== "closed") {
      if (usePollStore.getState().snapshot?.mine === option) {
        usePollStore.getState().setMine(before)
      }

      toast.error(
        t(
          outcome === "tooManyChanges"
            ? "poll:vote.tooManyChanges"
            : "poll:vote.failed",
        ),
        { id: "poll-vote" },
      )
    }

    socket.emit(EVENTS.POLL.SYNC, { gameId })
  }

  return (
    <PollFrame backgroundUrl={backgroundUrl} labelledBy={QUESTION_ID}>
      <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto p-4 pb-6">
        <header className="flex flex-col gap-2">
          <p className="text-brand text-xs font-bold tracking-[0.12em] uppercase">
            {closed ? t("poll:closedTitle") : t("poll:label")}
          </p>
          <h2
            id={QUESTION_ID}
            className={clsx(
              "text-text-primary leading-snug font-bold break-words",
              QUESTION_CLASSES[questionTier(question)],
            )}
          >
            {question}
          </h2>
          <p className="text-text-muted text-sm">
            {anonymous ? t("poll:privacy.anonymous") : t("poll:privacy.named")}
          </p>
        </header>

        {closed ? (
          <PollBars
            options={options}
            counts={snapshot.counts ?? options.map(() => 0)}
            total={snapshot.total ?? 0}
            mine={mine}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {options.map((option, index) => (
              <li key={index}>
                <button
                  type="button"
                  aria-pressed={mine === index}
                  data-poll-choice={index}
                  className={clsx(
                    "bg-glass border-border rounded-rz-lg ease-calm flex min-h-16 w-full items-center gap-3 border p-3 text-left transition-transform active:scale-[0.98]",
                    mine === index && "outline-text-primary outline-2",
                  )}
                  onClick={() => {
                    void vote(index)
                  }}
                >
                  <span className="bg-panel border-border text-text-primary rounded-rz-md grid size-11 shrink-0 place-items-center border font-mono text-lg font-bold">
                    {LETTERS[index]}
                  </span>
                  <span
                    className={clsx(
                      "text-text-primary min-w-0 flex-1 font-semibold break-words",
                      OPTION_CLASSES[tier],
                    )}
                  >
                    {option}
                  </span>
                  {mine === index && (
                    <Check
                      aria-label={t("poll:yourVote")}
                      className="text-brand size-6 shrink-0 stroke-3"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-text-muted mt-auto pt-2 text-sm">
          {closed ? t("poll:waitingForHost") : t("poll:changeHint")}
        </p>
      </main>
    </PollFrame>
  )
}

export default PlayerPollOverlay
