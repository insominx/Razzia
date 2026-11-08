import type { GameResult } from "@razzia/common/types/game"
import ResultModal from "@razzia/web/features/manager/components/ResultModal"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const base: GameResult = {
  id: "r1",
  subject: "Capitals",
  date: "2026-01-01T10:00:00.000Z",
  players: [{ username: "Ann", points: 900, rank: 1 }],
  questions: [],
}

describe("ResultModal", () => {
  afterEach(cleanup)

  it("renders a result with no questions without crashing", () => {
    render(<ResultModal result={base} onClose={vi.fn()} />)

    expect(screen.getByText("Capitals")).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.queryByText("manager:result.paginationOf")).toBeNull()
  })

  it("shows one denominator, a clamped percentage and a dash for unknown points", () => {
    render(
      <ResultModal
        result={{
          ...base,
          questions: [
            {
              question: "Capital of France?",
              answers: ["Paris", "Rome"],
              solutions: [0],
              time: 20,
              cooldown: 5,
              playerAnswers: [
                { playerName: "Ann", answerId: 0 },
                { playerName: "Late", answerId: 0 },
                { playerName: "Bob", answerId: null },
              ],
            } as GameResult["questions"][number],
          ],
        }}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText("2/3")).toBeTruthy()
    expect(screen.getByText("67%")).toBeTruthy()

    const rows = screen.getAllByRole("row")
    const late = rows.find((row) => within(row).queryByText("Late"))
    const ann = rows.find((row) => within(row).queryByText("Ann"))

    expect(late && within(late).getAllByText("—").length).toBe(1)
    expect(ann && within(ann).getByText("900")).toBeTruthy()
  })
})
