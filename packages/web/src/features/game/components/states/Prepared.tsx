import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import QuestionNumber from "@razzia/web/features/game/components/QuestionNumber"

interface Props {
  data: CommonStatusDataMap["SHOW_PREPARED"]
}

const Prepared = ({ data: { questionNumber } }: Props) => (
  <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
    <QuestionNumber questionNumber={questionNumber} intro />
  </section>
)

export default Prepared
