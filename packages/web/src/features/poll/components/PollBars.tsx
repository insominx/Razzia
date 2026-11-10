import type { PollVoter } from "@razzia/common/types/poll"
import { LETTERS } from "@razzia/web/features/poll/utils/letters"
import {
  OPTION_CLASSES,
  optionTier,
  TWO_COLUMNS_FROM,
} from "@razzia/web/features/poll/utils/type-tier"
import clsx from "clsx"
import type { CSSProperties } from "react"
import { useTranslation } from "react-i18next"

// A projector row has little room for names; the rest are counted.
const NAMES_SHOWN = 8

// The result reveal: each bar grows from its left edge and its count ticks up
// from 0, one option after another, when the bars first appear (the close of a
// sealed poll). Later changes to a live poll only slide the width.
const REVEAL_MS = 1100
const STAGGER_MS = 160

const reveal = (
  index: number,
  style: Record<string, string | number>,
  extraDelay = 0,
): CSSProperties =>
  ({
    ...style,
    animationDuration: `${REVEAL_MS}ms`,
    animationDelay: `${index * STAGGER_MS + extraDelay}ms`,
  }) as CSSProperties

interface Props {
  options: string[]
  counts: number[]
  total: number
  // The option this player picked, when this is a player's screen.
  mine?: number | null
  // Named polls, host screen only.
  voters?: PollVoter[]
  // How many names to list under an option before counting the rest. The
  // projector has room for a few; a list on the manager page has room for all.
  namesLimit?: number
  // A sealed poll that is still open: the options only, with no count, no
  // share and no bar, because the host's screen has not been told any.
  sealed?: boolean
}

/**
 * Each option's share of the vote, as a rail under the words so nothing
 * crosses the copy (the same rule as the quiz's results tiles).
 */
const PollBars = ({
  options,
  counts,
  total,
  mine = null,
  voters,
  namesLimit = NAMES_SHOWN,
  sealed = false,
}: Props) => {
  const { t } = useTranslation()
  const tier = optionTier(options)
  // Four or more options would not fit the projector's height in one column,
  // so the stage sets them in two; a lone last one spans the pair.
  const twoColumns = options.length >= TWO_COLUMNS_FROM

  return (
    <ol
      data-columns={twoColumns ? 2 : 1}
      className={clsx(
        "stage:gap-4 grid w-full shrink-0 grid-cols-1 gap-2",
        twoColumns &&
          "stage:grid-cols-2 stage:[&>li:last-child:nth-child(odd)]:col-span-2",
      )}
    >
      {options.map((option, index) => {
        const count = counts[index] ?? 0
        const percent = total > 0 ? Math.round((count * 100) / total) : 0
        const names = (voters ?? [])
          .filter((voter) => voter.option === index)
          .map(({ username }) => username)
        const picked = mine === index

        return (
          <li
            key={index}
            data-poll-option={index}
            data-mine={picked ? "" : undefined}
            className={clsx(
              "bg-glass border-border rounded-rz-lg stage:gap-5 stage:p-4 flex items-start gap-3 border p-3",
              picked && "outline-text-primary outline-2",
            )}
          >
            <span className="bg-panel border-border text-text-primary rounded-rz-md stage:size-[4.5rem] stage:text-[2.6875rem] grid size-11 shrink-0 place-items-center border font-mono text-lg font-bold">
              {LETTERS[index]}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={clsx(
                    "text-text-primary stage:leading-tight min-w-0 font-semibold break-words",
                    OPTION_CLASSES[tier],
                  )}
                >
                  {option}
                </span>
                {!sealed && (
                  <span
                    data-poll-count
                    className="text-text-primary stage:text-[2.6875rem] shrink-0 font-mono text-lg font-bold tabular-nums"
                  >
                    {/* The count ticks up from 0 as its bar grows (a CSS
                        counter, so the real number stays in the text). */}
                    <span
                      aria-hidden="true"
                      className="rz-count-up"
                      style={reveal(index, { "--rz-to": count })}
                    />
                    <span className="sr-only">{count}</span>
                    <span
                      className="text-text-muted stage:text-[1.75rem] animate-rz-fade-in ml-2 text-sm font-medium"
                      style={reveal(index, {}, REVEAL_MS * 0.6)}
                    >
                      {percent}%
                    </span>
                  </span>
                )}
              </div>

              {!sealed && (
                <div
                  aria-hidden="true"
                  className="bg-panel stage:mt-3 stage:h-4 mt-2 h-2 overflow-hidden rounded-full"
                >
                  <div
                    className="bg-brand ease-calm animate-rz-bar-grow h-full origin-left rounded-full transition-[width] duration-[var(--rz-dur-base)] motion-reduce:transition-none"
                    style={reveal(index, { width: `${percent}%` })}
                  />
                </div>
              )}

              {picked && (
                <p className="text-brand stage:text-[1.5rem] mt-2 text-xs font-bold tracking-[0.12em] uppercase">
                  {t("poll:yourVote")}
                </p>
              )}

              {names.length > 0 && (
                <p
                  data-poll-names
                  className="text-text-muted stage:mt-3 stage:text-[1.5rem] mt-2 text-sm"
                >
                  {names.slice(0, namesLimit).join(", ")}
                  {names.length > namesLimit &&
                    ` ${t("poll:more", { count: names.length - namesLimit })}`}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default PollBars
