import { EVENTS } from "@razzia/common/constants"
import Wait from "@razzia/web/features/game/components/states/Wait"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const handlers = new Map<string, (..._args: unknown[]) => void>()

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit: vi.fn() }, isConnected: true }),
  useEvent: (event: string, callback: (..._args: unknown[]) => void) => {
    handlers.set(event, callback)
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

describe("Wait", () => {
  beforeEach(() => {
    handlers.clear()
    usePlayerStore.getState().reset()
    useQuestionStore.getState().setQuestionStates({ current: 3, total: 5 })
  })

  afterEach(() => {
    cleanup()
  })

  it("holds the tile this player picked for the current question", () => {
    usePlayerStore
      .getState()
      .setLastAnswer({ questionNumber: 3, key: 1, text: "Mars" })

    const { container } = render(
      <Wait data={{ text: "game:waitingForAnswers" }} />,
    )

    expect(container.querySelector("[data-picked-answer]")).not.toBeNull()
    expect(container.querySelector("[data-locked-in]")?.textContent).toBe(
      "game:lockedIn",
    )
    expect(screen.getByText("B")).toBeTruthy()
    expect(screen.getByText("Mars")).toBeTruthy()
    expect(
      container.querySelector("[data-answer-tile]")?.getAttribute("data-state"),
    ).toBe("picked")
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

  it("shows how many of the room are in, and keeps counting", () => {
    usePlayerStore
      .getState()
      .setLastAnswer({ questionNumber: 3, key: 1, text: "Mars" })

    const { container } = render(
      <Wait data={{ text: "game:waitingForAnswers", answered: 3, total: 8 }} />,
    )

    const line = () =>
      container.querySelector("[data-answered-count]")?.textContent

    expect(line()).toBe('game:answeredOf:{"answered":3,"total":8}')

    act(() => {
      handlers.get(EVENTS.GAME.PLAYER_ANSWER)?.(5)
    })

    expect(line()).toBe('game:answeredOf:{"answered":5,"total":8}')
  })

  it("has no count line when the server did not send one", () => {
    usePlayerStore
      .getState()
      .setLastAnswer({ questionNumber: 3, key: 1, text: "Mars" })

    const { container } = render(
      <Wait data={{ text: "game:waitingForAnswers" }} />,
    )

    expect(container.querySelector("[data-answered-count]")).toBeNull()
  })

  it("nudges the held tile when it is tapped", () => {
    usePlayerStore
      .getState()
      .setLastAnswer({ questionNumber: 3, key: 1, text: "Mars" })

    const { container } = render(
      <Wait data={{ text: "game:waitingForAnswers", answered: 1, total: 4 }} />,
    )
    const tile = () => container.querySelector("[data-answer-tile]")

    expect(tile()?.classList.contains("rz-nudge")).toBe(false)

    fireEvent.click(screen.getByText("Mars"))

    expect(tile()?.classList.contains("rz-nudge")).toBe(true)
  })

  it("shows a head count that arrived before the screen did", () => {
    usePlayerStore.getState().setPlayersHere(7)

    const { container } = render(
      <Wait data={{ text: "game:waitingForPlayers" }} />,
    )

    expect(container.querySelector("[data-players-here]")?.textContent).toBe(
      'game:playersHere:{"count":7}',
    )
  })

  it("tells a player in the lobby they are in, and how many are here", () => {
    usePlayerStore.getState().setPlayer({ username: "Ada", points: 0 })

    const { container } = render(
      <Wait data={{ text: "game:waitingForPlayers" }} />,
    )

    expect(container.querySelector("[data-youre-in]")?.textContent).toBe(
      'game:youreIn:{"name":"Ada"}',
    )
    expect(container.querySelector("[data-players-here]")).toBeNull()

    act(() => {
      handlers.get(EVENTS.GAME.TOTAL_PLAYERS)?.(7)
    })

    expect(container.querySelector("[data-players-here]")?.textContent).toBe(
      'game:playersHere:{"count":7}',
    )
  })

  it("does not greet a screen with no player behind it", () => {
    const { container } = render(
      <Wait data={{ text: "game:waitingForPlayers" }} />,
    )

    expect(container.querySelector("[data-youre-in]")).toBeNull()
  })
})
