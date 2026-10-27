import { STATUS, type Status } from "@razzia/common/types/game/status"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useTranslation } from "react-i18next"

// The lobby is long gone between a lecture's questions; latecomers still need
// the PIN, so the screens the room sees between questions repeat it.
const SHOWN_ON = new Set<Status>([
  STATUS.SHOW_RESPONSES,
  STATUS.SHOW_LEADERBOARD,
])

interface Props {
  statusName: Status | undefined
}

const LectureJoinHint = ({ statusName }: Props) => {
  const lecture = useManagerStore((state) => state.lecture)
  const { t } = useTranslation()

  if (
    !lecture ||
    lecture.finished ||
    !statusName ||
    !SHOWN_ON.has(statusName)
  ) {
    return null
  }

  // Centered over the top bar, clear of the host buttons and of anything a
  // presenting tool docks in the screen's corners.
  return (
    <p className="bg-surface border-border text-text-primary rounded-rz-md pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 border px-4 py-2 text-lg font-bold whitespace-nowrap">
      {t("game:lectureJoinHint", {
        url: window.location.host,
        pin: lecture.inviteCode,
      })}
    </p>
  )
}

export default LectureJoinHint
