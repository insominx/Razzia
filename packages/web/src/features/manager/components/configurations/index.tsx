import { EVENTS } from "@razzia/common/constants"
import type { ManagerConfig } from "@razzia/common/types/manager"
import Card from "@razzia/web/components/Card"
import LanguageSwitcher from "@razzia/web/components/LanguageSwitcher"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import ConfigManageQuizz from "@razzia/web/features/manager/components/configurations/ConfigManageQuizz"
import ConfigResults from "@razzia/web/features/manager/components/configurations/ConfigResults"
import ConfigSelectQuizz from "@razzia/web/features/manager/components/configurations/ConfigSelectQuizz"
import ConfigTabButton from "@razzia/web/features/manager/components/configurations/ConfigTabButton"
import ConfigVisuals from "@razzia/web/features/manager/components/configurations/ConfigVisuals"
import { ConfigProvider } from "@razzia/web/features/manager/contexts/config-context"
import { LogOut } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const tabs = [
  {
    nameKey: "manager:tabs.play",
    component: ConfigSelectQuizz,
  },
  {
    nameKey: "manager:tabs.quizz",
    component: ConfigManageQuizz,
  },
  {
    nameKey: "manager:tabs.results",
    component: ConfigResults,
  },
  {
    nameKey: "manager:tabs.visuals",
    component: ConfigVisuals,
  },
]

interface Props {
  data: ManagerConfig
}

const Configurations = ({ data }: Props) => {
  const [selectedTab, setSelectedTab] = useState(0)
  const { reset } = useManagerStore()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const TabComponent = tabs[selectedTab].component

  const handleSelect = (index: number) => () => {
    setSelectedTab(index)
  }

  const handleLogout = () => {
    socket.emit(EVENTS.MANAGER.LOGOUT)
    reset()
  }

  return (
    <ConfigProvider data={data}>
      {/* Fixed height: a tab switch changing the card's height would re-centre
          it (and the logo above it) on every click. Tall tabs scroll inside.
          13rem leaves room for the logo above and the version link below. */}
      <Card className="border-border bg-surface text-text-body rounded-rz-xl h-[min(42rem,calc(100svh-13rem))] w-full max-w-md border shadow-none">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-text-primary text-lg font-semibold">
            {t("manager:configurationsTitle")}
          </p>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button
              className="text-text-muted hover:bg-panel hover:text-text-body rounded-rz-sm p-1.5"
              onClick={handleLogout}
              title={t("manager:logout")}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        <div className="border-border bg-panel rounded-rz-md flex shrink-0 overflow-hidden border">
          {tabs.map((tab, index) => (
            <ConfigTabButton
              key={tab.nameKey}
              active={index === selectedTab}
              onClick={handleSelect(index)}
            >
              {t(tab.nameKey)}
            </ConfigTabButton>
          ))}
        </div>
        <hr className="border-border my-4" />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <TabComponent />
        </div>
      </Card>
    </ConfigProvider>
  )
}

export default Configurations
