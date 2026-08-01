import * as Switch from "@radix-ui/react-switch"
import { NO_TIME_LIMIT } from "@razzia/common/constants"
import ConfigField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import ConfigNumberInput from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigNumberInput"
import ConfigSection from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigSection"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { Clock, Timer } from "lucide-react"
import { useTranslation } from "react-i18next"

const DEFAULT_TIME = 20

const QuestionEditorConfig = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()
  const isTimeLimitEnabled = currentQuestion.time !== NO_TIME_LIMIT

  const handleUpdateQuestion = (key: string) => (value: string | number) => {
    updateQuestion(currentIndex, { [key]: value })
  }

  const handleToggleTimeLimit = (checked: boolean) => {
    updateQuestion(currentIndex, {
      time: checked ? DEFAULT_TIME : NO_TIME_LIMIT,
    })
  }

  return (
    <aside className="bg-surface border-border rounded-rz-lg z-10 m-3 flex w-68 shrink-0 flex-col gap-6 self-start overflow-auto border p-4">
      <ConfigSection title={t("quizz:question.config.timings")}>
        <ConfigField>
          <ConfigField.Label
            icon={<Clock className="size-4" />}
            label={t("quizz:question.config.questionDisplay")}
          />
          <ConfigNumberInput
            value={currentQuestion.cooldown}
            min={3}
            onChange={handleUpdateQuestion("cooldown")}
          />
          <ConfigField.Description>
            {t("quizz:question.config.questionDisplayHint")}
          </ConfigField.Description>
        </ConfigField>

        <ConfigField>
          <ConfigField.Label
            icon={<Timer className="size-4" />}
            label={t("quizz:question.config.answerTime")}
            unit={isTimeLimitEnabled ? "sec" : undefined}
            action={
              <Switch.Root
                checked={isTimeLimitEnabled}
                onCheckedChange={handleToggleTimeLimit}
                className="bg-panel focus-visible:outline-brand data-[state=checked]:bg-brand relative h-5 w-9 cursor-pointer rounded-full transition-colors ease-calm focus-visible:outline-2"
              >
                <Switch.Thumb className="bg-surface border-border block size-4 translate-x-0.5 rounded-full border transition-transform ease-calm data-[state=checked]:translate-x-4.5" />
              </Switch.Root>
            }
          />
          {isTimeLimitEnabled && (
            <ConfigNumberInput
              value={currentQuestion.time}
              min={5}
              onChange={handleUpdateQuestion("time")}
            />
          )}
          <ConfigField.Description>
            {isTimeLimitEnabled
              ? t("quizz:question.config.answerTimeHint")
              : t("quizz:question.config.noTimeLimitHint")}
          </ConfigField.Description>
        </ConfigField>
      </ConfigSection>
    </aside>
  )
}

export default QuestionEditorConfig
