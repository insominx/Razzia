import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ANSWER_BADGE_COLORS } from "@razzia/web/features/game/utils/constants"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("Prepared answer tiles", () => {
  it("applies answer badge recipe so letters keep identity mass", async () => {
    const Prepared = (
      await import("@razzia/web/features/game/components/states/Prepared")
    ).default

    const { container } = render(
      <Prepared data={{ totalAnswers: 4, questionNumber: 1 }} />,
    )

    const tiles = container.querySelectorAll(".button")
    expect(tiles).toHaveLength(4)

    tiles.forEach((tile, index) => {
      for (const token of ANSWER_BADGE_COLORS[index].split(" ")) {
        expect(tile.className).toContain(token)
      }
    })

    expect(screen.getByText("A")).toBeInTheDocument()
    expect(screen.getByText("D")).toBeInTheDocument()
  })
})
