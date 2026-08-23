import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import prepared from "@razzia/web/assets/prepared.jpg"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["SHOW_PREPARED"]
}

const Prepared = ({ data: { questionNumber } }: Props) => {
  const { t } = useTranslation()

  return (
    <section className="anim-show relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      <h2 className="anim-show text-text-primary mb-12 text-center text-3xl font-bold md:mb-16 md:text-4xl lg:text-5xl">
        {t("game:questionPrefix")}
        {questionNumber}
      </h2>
      <img
        src={prepared}
        alt=""
        className="anim-show w-72 max-w-[min(80vw,24rem)] select-none md:w-96"
      />
    </section>
  )
}

export default Prepared
