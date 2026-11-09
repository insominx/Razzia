import { EVENTS } from "@razzia/common/constants"
import Start from "@razzia/web/features/game/components/states/Start"
import { useLaunchStore } from "@razzia/web/features/game/stores/launch"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  handlers: new Map<string, (payload?: unknown) => void>(),
}))

vi.mock("@razzia/web/features/game/contexts/socket-context", () => ({
  useEvent: (event: string, callback: (payload?: unknown) => void) => {
    mocks.handlers.set(event, callback)
  },
}))

// The score has its own tests; here a screen is judged by what it asks of it.
vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: { start: mocks.start },
}))

const fire = (event: string, payload?: unknown) => {
  act(() => {
    mocks.handlers.get(event)?.(payload)
  })
}

const lamps = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-lamp]")].map((lamp) =>
    lamp.getAttribute("data-lamp"),
  )

describe("Start", () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.start.mockClear()
    useLaunchStore.setState({ armed: false })
  })

  afterEach(() => {
    cleanup()
  })

  it("opens on the title, with no lamps", () => {
    const { container } = render(<Start data={{ time: 3, subject: "Git" }} />)

    expect(container.querySelector("[data-start-title]")?.textContent).toBe(
      "Git",
    )
    expect(container.querySelector("[data-lamps]")).toBeNull()
  })

  it("lights one lamp for each second of the countdown", () => {
    const { container } = render(<Start data={{ time: 3, subject: "Git" }} />)

    fire(EVENTS.GAME.START_COOLDOWN)
    expect(container.querySelector("[data-start-title]")).toBeNull()
    expect(lamps(container)).toEqual(["on", "off", "off"])

    fire(EVENTS.GAME.COOLDOWN, 2)
    expect(lamps(container)).toEqual(["on", "on", "off"])

    fire(EVENTS.GAME.COOLDOWN, 1)
    expect(lamps(container)).toEqual(["on", "on", "on"])
    expect(container.querySelector("[data-start-count]")?.textContent).toBe("1")
  })

  it("scores the title as the quiz opens", () => {
    render(<Start data={{ time: 3, subject: "Git" }} />)

    expect(mocks.start.mock.calls).toEqual([[{ scene: "title" }]])
  })

  it("scores the lamps as one scene when the countdown starts, not step by step", () => {
    render(<Start data={{ time: 3, subject: "Git" }} />)
    mocks.start.mockClear()

    fire(EVENTS.GAME.START_COOLDOWN)
    fire(EVENTS.GAME.COOLDOWN, 2)
    fire(EVENTS.GAME.COOLDOWN, 1)

    // Three clunks and the GO are inside the scene, on its own clock.
    expect(mocks.start.mock.calls).toEqual([[{ scene: "lamps" }]])
  })

  it("picks up the lamps for a reconnect that missed the countdown's start", () => {
    const { container } = render(<Start data={{ time: 3, subject: "Git" }} />)
    mocks.start.mockClear()

    // Back mid-countdown: START_COOLDOWN went by, the ticks still come.
    fire(EVENTS.GAME.COOLDOWN, 2)

    expect(container.querySelector("[data-start-title]")).toBeNull()
    expect(lamps(container)).toEqual(["on", "on", "off"])
    expect(container.querySelector("[data-start-count]")?.textContent).toBe("2")
    // The clunks were scheduled from the start; a late start would be off the beat.
    expect(mocks.start).not.toHaveBeenCalled()
    // The lamps were seen, so the first card still gets its GO.
    expect(useLaunchStore.getState().armed).toBe(true)
  })

  it("hands GO to the first round card once the lamps start", () => {
    render(<Start data={{ time: 3, subject: "Git" }} />)

    expect(useLaunchStore.getState().armed).toBe(false)

    fire(EVENTS.GAME.START_COOLDOWN)

    expect(useLaunchStore.getState().armed).toBe(true)
  })
})
