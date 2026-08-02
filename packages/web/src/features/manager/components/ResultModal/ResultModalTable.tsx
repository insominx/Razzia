import {
  ANSWER_IDENTITY,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import { useResultModal } from "@razzia/web/features/manager/contexts/result-modal-context"
import clsx from "clsx"
import { Check, X } from "lucide-react"
import { useTranslation } from "react-i18next"

const ResultModalTable = () => {
  const { questionResult, getPlayerPoints } = useResultModal()
  const { t } = useTranslation()

  return (
    <table className="w-full text-sm">
      <thead className="bg-panel sticky top-0">
        <tr className="border-border text-text-muted border-b text-left text-xs font-semibold tracking-wide uppercase">
          <th className="px-5 py-2.5">{t("manager:result.table.player")}</th>
          <th className="px-4 py-2.5">{t("manager:result.table.answered")}</th>
          <th className="px-4 py-2.5">
            {t("manager:result.table.correctIncorrect")}
          </th>
          <th className="px-4 py-2.5 text-right">
            {t("manager:result.table.points")}
          </th>
        </tr>
      </thead>
      <tbody className="divide-border divide-y">
        {questionResult.playerAnswers.map((pa, i) => {
          const isCorrect =
            pa.answerId !== null &&
            questionResult.solutions.includes(pa.answerId)
          const answerLabel =
            pa.answerId !== null ? ANSWERS_LABELS[pa.answerId % 4] : null

          return (
            <tr key={i} className="hover:bg-panel ease-calm transition-colors">
              <td className="px-5 py-2.5 font-medium">{pa.playerName}</td>
              <td className="px-4 py-2.5">
                {pa.answerId !== null && answerLabel ? (
                  <span
                    className={clsx(
                      "rounded-rz-sm inline-flex items-center gap-1.5 border px-2 py-1 text-xs",
                      ANSWER_IDENTITY[pa.answerId % 4],
                    )}
                  >
                    <span className="font-bold">{answerLabel}</span>
                    <span className="max-w-30 truncate">
                      {questionResult.answers[pa.answerId]}
                    </span>
                  </span>
                ) : (
                  <span className="text-text-faint text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {isCorrect ? (
                  <span className="text-success flex items-center gap-1">
                    <Check className="size-3.5" />{" "}
                    {t("manager:result.table.correct")}
                  </span>
                ) : (
                  <span className="text-danger flex items-center gap-1">
                    <X className="size-3.5" />{" "}
                    {t("manager:result.table.incorrect")}
                  </span>
                )}
              </td>
              <td className="text-text-body px-4 py-2.5 text-right font-semibold">
                {getPlayerPoints(pa.playerName)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default ResultModalTable
