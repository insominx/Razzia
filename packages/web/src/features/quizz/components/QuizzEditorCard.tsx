import { MEDIA_TYPES } from "@razzia/common/constants"
import type { QuestionMedia } from "@razzia/common/types/game"
import AlertDialog from "@razzia/web/components/AlertDialog"
import { type QuestionWithId } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { Music, Trash2, Video } from "lucide-react"
import { useTranslation } from "react-i18next"
import { twMerge } from "tailwind-merge"

const SlideMedia = ({ media }: { media?: QuestionMedia }) => {
  if (media?.type === MEDIA_TYPES.IMAGE) {
    return (
      <img src={media.url} className="mx-auto max-h-14 w-auto rounded-md" />
    )
  }

  if (media?.type === MEDIA_TYPES.VIDEO) {
    return <Video className="text-text-faint mx-auto size-10" />
  }

  if (media?.type === MEDIA_TYPES.AUDIO) {
    return <Music className="text-text-faint mx-auto size-10" />
  }

  return null
}

interface Props {
  question: QuestionWithId
  index: number
  isActive: boolean
  canDelete: boolean
  onClick: () => void
  onDelete: () => void
}

const QuizzEditorCard = ({
  question,
  index,
  isActive,
  canDelete,
  onClick,
  onDelete,
}: Props) => {
  const { t } = useTranslation()

  return (
    <div
      onClick={onClick}
      className={twMerge(
        clsx(
          "bg-surface border-border rounded-rz-md group ease-calm relative flex h-36 cursor-pointer flex-col justify-between gap-1 border-2 px-6 py-2 transition-colors",
          {
            "border-brand bg-brand-tint": isActive,
          },
        ),
      )}
    >
      <span className="text-text-faint absolute top-2 left-2 text-xs font-semibold">
        {index + 1}
      </span>
      <p className="text-text-body truncate text-center text-xs font-semibold">
        {question.question || t("quizz:noQuestionYet")}
      </p>

      <SlideMedia media={question.media} />

      <div className="grid grid-cols-2 gap-1">
        {question.answers.map((_, i) => (
          <div
            key={i}
            className="border-border rounded-rz-sm flex h-4 flex-1 items-center border px-0.5"
          >
            {question.solutions.includes(i) && (
              <div className="bg-success ml-auto size-1.5 rounded-full" />
            )}
          </div>
        ))}
      </div>

      {canDelete && (
        <AlertDialog
          trigger={
            <button
              onClick={(e) => e.stopPropagation()}
              className="bg-surface text-text-faint hover:bg-danger-tint hover:text-danger rounded-rz-sm ease-calm absolute top-1.5 right-1.5 hidden p-1 transition-colors group-hover:block"
            >
              <Trash2 className="size-3.5" />
            </button>
          }
          title={t("quizz:question.deleteQuestion")}
          description={t("quizz:question.deleteQuestionConfirm")}
          confirmLabel={t("common:delete")}
          onConfirm={onDelete}
        />
      )}
    </div>
  )
}

export default QuizzEditorCard
