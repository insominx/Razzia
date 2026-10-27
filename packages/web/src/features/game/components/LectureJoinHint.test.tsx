import { STATUS } from "@razzia/common/types/game/status"
import LectureJoinHint from "@razzia/web/features/game/components/LectureJoinHint"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      `${key} ${values?.pin ?? ""}`.trim(),
  }),
}))

const lecture = {
  inviteCode: "123456",
  total: 6,
  played: [0],
  current: 0,
  finished: false,
}

describe("LectureJoinHint", () => {
  beforeEach(() => {
    useManagerStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
  })

  it.each([STATUS.SHOW_RESPONSES, STATUS.SHOW_LEADERBOARD])(
    "repeats a lecture's PIN on %s",
    (statusName) => {
      useManagerStore.getState().setLecture(lecture)

      render(<LectureJoinHint statusName={statusName} />)

      expect(
        screen.getByText("game:lectureJoinHint 123456"),
      ).toBeInTheDocument()
    },
  )

  it("stays out of the way during a question", () => {
    useManagerStore.getState().setLecture(lecture)

    const { container } = render(
      <LectureJoinHint statusName={STATUS.SELECT_ANSWER} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("never shows in a normal game or after the podium", () => {
    const { container, rerender } = render(
      <LectureJoinHint statusName={STATUS.SHOW_RESPONSES} />,
    )

    expect(container).toBeEmptyDOMElement()

    useManagerStore.getState().setLecture({ ...lecture, finished: true })
    rerender(<LectureJoinHint statusName={STATUS.SHOW_LEADERBOARD} />)

    expect(container).toBeEmptyDOMElement()
  })
})
