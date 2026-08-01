import { MEDIA_TYPES, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { QuestionMedia } from "@razzia/common/types/game"
import {
  ANSWER_IDENTITY,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import { useResultModal } from "@razzia/web/features/manager/contexts/result-modal-context"
import clsx from "clsx"
import { Check, Clock, ImageOff, Music, Video, X } from "lucide-react"
import { useTranslation } from "react-i18next"

interface AnswerRow {
  label: string
  count: number
  isCorrect: boolean
  color: string | null
  answerLabel: string | null
}

const MediaPreview = ({ media }: { media?: QuestionMedia }) => {
  if (media?.type === MEDIA_TYPES.IMAGE) {
    return (
      <img
        src={media.url}
        alt=""
        className="h-16 w-auto rounded-md object-contain md:h-full"
      />
    )
  }

  if (media?.type === MEDIA_TYPES.VIDEO) {
    return (
      <div className="bg-panel border-border rounded-rz-md flex h-16 w-24 items-center justify-center border md:h-38 md:w-full">
        <Video className="text-text-faint size-6 md:size-10" />
      </div>
    )
  }

  if (media?.type === MEDIA_TYPES.AUDIO) {
    return (
      <div className="bg-panel border-border rounded-rz-md flex h-16 w-24 items-center justify-center border md:h-38 md:w-full">
        <Music className="text-text-faint size-6 md:size-10" />
      </div>
    )
  }

  return (
    <div className="bg-panel border-border rounded-rz-md flex h-16 w-24 items-center justify-center border md:h-38 md:w-full">
      <ImageOff className="text-text-faint size-6 md:size-10" />
    </div>
  )
}

const ResultModalAnswers = () => {
  const { questionResult, totalPlayers, answeredCount } = useResultModal()
  const { t } = useTranslation()

  const noAnswerCount = totalPlayers - answeredCount

  const rows: AnswerRow[] = [
    ...questionResult.answers.map((label, ai) => ({
      label,
      count: questionResult.playerAnswers.filter((pa) => pa.answerId === ai)
        .length,
      isCorrect: questionResult.solutions.includes(ai),
      color: ANSWER_IDENTITY[ai % 4],
      answerLabel: ANSWERS_LABELS[ai % 4],
    })),
    {
      label: t("manager:result.noAnswer"),
      count: noAnswerCount,
      isCorrect: false,
      color: null,
      answerLabel: null,
    },
  ]

  return (
    <div className="border-border flex flex-col border-b md:flex-row">
      <div className="border-border bg-panel flex shrink-0 flex-row items-center gap-4 border-b p-4 md:w-66 md:flex-col md:justify-center md:border-r md:border-b-0">
        <MediaPreview media={questionResult.media} />
        <div className="text-text-muted flex items-center gap-1.5 text-xs">
          <Clock className="size-3.5" />
          <span>
            {questionResult.time === NO_TIME_LIMIT
              ? "∞"
              : `${questionResult.time}${t("manager:result.timeLimitSuffix")}`}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden px-4 py-3 md:gap-2 md:px-5 md:py-4">
        <p className="text-text-primary text-md mb-1 font-semibold">
          {questionResult.question}
        </p>

        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-3">
            {row.color && row.answerLabel ? (
              <div
                className={clsx(
                  "rounded-rz-sm flex size-6 shrink-0 items-center justify-center border text-xs font-bold",
                  row.color,
                )}
              >
                {row.answerLabel}
              </div>
            ) : (
              <div className="border-border bg-surface rounded-rz-sm flex size-6 shrink-0 items-center justify-center border">
                <X className="text-text-faint size-3" />
              </div>
            )}

            <span
              className={clsx("min-w-0 flex-1 truncate text-sm font-medium", {
                "text-text-faint": !row.color,
              })}
            >
              {row.label}
            </span>

            <div className="shrink-0">
              {row.isCorrect ? (
                <Check className="text-success size-5" />
              ) : (
                <X
                  className={clsx(
                    "size-5",
                    "text-danger",
                  )}
                />
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-text-body text-center text-sm font-semibold">
                {row.count}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ResultModalAnswers
