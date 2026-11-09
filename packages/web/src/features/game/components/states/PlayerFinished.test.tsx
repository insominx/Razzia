import PlayerFinished from "@razzia/web/features/game/components/states/PlayerFinished"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

// A canvas does not exist in jsdom; the burst only matters as present or not.
vi.mock("react-confetti", () => ({
  default: () => <canvas data-confetti />,
}))

const finished = (rank: number, extra = {}) => ({
  subject: "Git",
  top: [],
  rank,
  total: 14,
  points: 6_300,
  ...extra,
})

describe("PlayerFinished", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePlayerStore.getState().reset()
    useManagerStore.getState().setVisuals({})
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("gives the top three a medal and a burst of confetti", () => {
    const { container } = render(<PlayerFinished data={finished(2)} />)

    expect(
      container
        .querySelector("[data-finish-medal]")
        ?.getAttribute("data-finish-medal"),
    ).toBe("2")
    expect(container.textContent).toContain("game:medal.2")
    expect(container.querySelector("[data-confetti]")).not.toBeNull()
  })

  it("stops the confetti after a few seconds", () => {
    const { container } = render(<PlayerFinished data={finished(1)} />)

    act(() => {
      vi.advanceTimersByTime(6_500)
    })

    expect(container.querySelector("[data-confetti]")).toBeNull()
    expect(container.querySelector("[data-finish-medal]")).not.toBeNull()
  })

  it("gives everyone else a plain ending, with no medal and no confetti", () => {
    const { container } = render(<PlayerFinished data={finished(9)} />)

    expect(container.querySelector("[data-finish-medal]")).toBeNull()
    expect(container.querySelector("[data-confetti]")).toBeNull()
    expect(container.textContent).toContain("game:rank.other")
  })

  it("summarises points and place among everyone who played", () => {
    const { container } = render(<PlayerFinished data={finished(9)} />)

    expect(container.querySelector("[data-finish-summary]")?.textContent).toBe(
      'game:finishedSummary:{"points":"6,300","rank":9,"total":14}',
    )
  })

  it("stays quiet when the room has asked for a calm show", () => {
    useManagerStore.getState().setVisuals({ showIntensity: "calm" })

    const { container } = render(<PlayerFinished data={finished(1)} />)

    expect(container.querySelector("[data-confetti]")).toBeNull()
    expect(container.querySelector("[data-finish-medal]")).not.toBeNull()
  })

  it("has no medal or summary for a player who did not finish ranked", () => {
    const { container } = render(
      <PlayerFinished data={{ subject: "Git", top: [] }} />,
    )

    expect(container.querySelector("[data-finish-medal]")).toBeNull()
    expect(container.querySelector("[data-finish-summary]")).toBeNull()
  })
})
