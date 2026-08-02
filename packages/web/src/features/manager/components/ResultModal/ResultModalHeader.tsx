import { useResultModal } from "@razzia/web/features/manager/contexts/result-modal-context"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useTranslation } from "react-i18next"

const ResultModalHeader = () => {
  const { result, questionIndex, total, goNext, goPrev, onClose } =
    useResultModal()
  const { t } = useTranslation()

  return (
    <div className="border-border flex shrink-0 items-center gap-3 border-b px-5 py-3">
      <h2 className="text-text-primary flex-1 truncate text-base font-bold">
        {result.subject}
      </h2>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-text-faint text-sm">
          {questionIndex + 1}
          {t("manager:result.paginationOf")}
          {total}
        </span>
        <button
          disabled={questionIndex === 0}
          onClick={goPrev}
          className="text-text-muted hover:bg-panel rounded-rz-sm ease-calm p-1 transition-colors disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          disabled={questionIndex === total - 1}
          onClick={goNext}
          className="text-text-muted hover:bg-panel rounded-rz-sm ease-calm p-1 transition-colors disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
        <button
          onClick={onClose}
          className="text-text-faint hover:bg-panel hover:text-text-body rounded-rz-sm ease-calm ml-1 p-1 transition-colors"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  )
}

export default ResultModalHeader
