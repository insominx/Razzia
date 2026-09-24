import Wait from "@razzia/web/features/game/components/states/Wait"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("Wait", () => {
  beforeEach(() => {
    usePlayerStore.getState().reset()
    useQuestionStore.getState().setQuestionStates({ current: 3, total: 5 })
  })

  afterEach(() => {
    cleanup()
  })

  it("echoes the tile this player picked for the current question", () => {
    usePlayerStore
      .getState()
      .setLastAnswer({ questionNumber: 3, key: 1, text: "Mars" })

    const { container } = render(
      <Wait data={{ text: "game:waitingForAnswers" }} />,
    )

    expect(container.querySelector("[data-picked-answer]")).not.toBeNull()
    expect(screen.getByText("B")).toBeTruthy()
    expect(screen.getByText("Mars")).toBeTruthy()
    expect(screen.getByText("game:yourAnswer")).toBeTruthy()
  })

  it("ignores a pick left over from an earlier question", () => {
    usePlayerStore
      .getState()
      .setLastAnswer({ questionNumber: 2, key: 0, text: "Venus" })

    const { container } = render(
      <Wait data={{ text: "game:waitingForAnswers" }} />,
    )

    expect(container.querySelector("[data-picked-answer]")).toBeNull()
    expect(screen.queryByText("Venus")).toBeNull()
  })

  it("keeps the lobby wait plain", () => {
    usePlayerStore
      .getState()
      .setLastAnswer({ questionNumber: 3, key: 1, text: "Mars" })

    const { container } = render(
      <Wait data={{ text: "game:waitingForPlayers" }} />,
    )

    expect(container.querySelector("[data-picked-answer]")).toBeNull()
    expect(screen.getByText("game:waitingForPlayers")).toBeTruthy()
  })
})
