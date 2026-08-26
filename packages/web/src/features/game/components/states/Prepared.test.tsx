import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import Prepared from "@razzia/web/features/game/components/states/Prepared"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => `${key} ` }),
}))

describe("Prepared question-number intro", () => {
  it("shows only the shared question number without the prepared image", () => {
    const { container } = render(
      <Prepared data={{ questionNumber: 7, totalAnswers: 4 }} />,
    )

    expect(screen.getByText("game:questionPrefix 7")).toBeInTheDocument()
    expect(container.querySelector("img")).not.toBeInTheDocument()
    expect(
      container.querySelector(
        '[data-question-number-layout="game-question-number"]',
      ),
    ).toHaveAttribute("data-question-number-phase", "intro")
  })
})
