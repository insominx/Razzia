import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import Username from "@razzia/web/features/game/components/join/Username"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { handlers, navigate, emit } = vi.hoisted(() => ({
  handlers: new Map<string, (..._args: unknown[]) => void>(),
  navigate: vi.fn(),
  emit: vi.fn(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useSocket: () => ({ socket: { emit } }),
  useEvent: (event: string, callback: (..._args: unknown[]) => void) => {
    handlers.set(event, callback)
  },
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const joined = (payload: Record<string, unknown>) => {
  act(() => {
    handlers.get(EVENTS.GAME.SUCCESS_JOIN)?.({
      gameId: "g-1",
      visuals: {},
      ...payload,
    })
  })
}

const inputOf = (container: HTMLElement) => {
  const input = container.querySelector("input")

  if (!input) {
    throw new Error("Expected an input in the rendered tree")
  }

  return input
}

describe("Username", () => {
  beforeEach(() => {
    handlers.clear()
    navigate.mockReset()
    emit.mockReset()
    usePlayerStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
  })

  it("shows a lecture's latecomer the text the server chose", () => {
    render(<Username />)

    joined({ waitText: "game:lectureNextQuestion" })

    expect(usePlayerStore.getState().status).toMatchObject({
      name: STATUS.WAIT,
      data: { text: "game:lectureNextQuestion" },
    })
  })

  it("waits for players in a normal lobby", () => {
    render(<Username />)

    joined({})

    expect(usePlayerStore.getState().status).toMatchObject({
      name: STATUS.WAIT,
      data: { text: "game:waitingForPlayers" },
    })
  })

  it("sends the name once however many times submit is pressed", () => {
    usePlayerStore.setState({ gameId: "g-1" })
    const { container } = render(<Username />)
    const input = inputOf(container)

    fireEvent.change(input, { target: { value: "Sam" } })
    fireEvent.keyDown(input, { key: "Enter" })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(emit).toHaveBeenCalledTimes(1)

    act(() => {
      handlers.get(EVENTS.GAME.ERROR_MESSAGE)?.("errors:game.usernameTaken")
    })
    // The shake remounts the field.
    fireEvent.keyDown(inputOf(container), {
      key: "Enter",
    })

    expect(emit).toHaveBeenCalledTimes(2)
  })

  it("reports the name that was sent, not the one typed since", () => {
    usePlayerStore.setState({ gameId: "g-1" })
    const { container } = render(<Username />)
    const input = inputOf(container)

    fireEvent.change(input, { target: { value: "Sam" } })
    fireEvent.keyDown(input, { key: "Enter" })
    fireEvent.change(input, { target: { value: "Sam K" } })
    joined({})

    expect(usePlayerStore.getState().player?.username).toBe("Sam")
  })

  it("goes back to the PIN when the game is gone", () => {
    usePlayerStore.setState({ gameId: "g-1", player: { points: 0 } })
    render(<Username />)

    act(() => {
      handlers.get(EVENTS.GAME.ERROR_MESSAGE)?.("errors:game.notFound")
    })

    expect(usePlayerStore.getState().gameId).toBeNull()
    expect(usePlayerStore.getState().player).toBeNull()
  })

  it("puts the cursor in the name field on arrival", () => {
    const { container } = render(<Username />)

    expect(document.activeElement).toBe(container.querySelector("input"))
  })

  it("shakes the field when the name is refused", () => {
    const { container } = render(<Username />)

    expect(container.querySelector("[data-shake]")).not.toHaveClass("rz-shake")

    act(() => {
      handlers.get(EVENTS.GAME.ERROR_MESSAGE)?.("errors:game.usernameTaken")
    })

    expect(container.querySelector("[data-shake]")).toHaveClass("rz-shake")
  })
})
