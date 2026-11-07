import type { PublicPlayer } from "@razzia/common/types/game"
import Podium from "@razzia/web/features/game/components/states/Podium"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import {
  CONFETTI_MS,
  podiumTimes,
  WINNER_FLOOD_MS,
} from "@razzia/web/features/game/utils/board"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A canvas does not exist in jsdom; the burst only matters as present or not.
vi.mock("react-confetti", () => ({
  default: () => <canvas data-confetti />,
}))

vi.mock("@razzia/web/hooks/useScreenSize", () => ({
  default: () => ({ width: 1920, height: 1080 }),
}))

const { start } = vi.hoisted(() => ({ start: vi.fn() }))

// The score has its own tests; here the podium is judged by the scene it asks for.
vi.mock("@razzia/web/features/game/audio", () => ({
  score: { start, cue: vi.fn(), stop: vi.fn() },
}))

const player = (id: string, points: number): PublicPlayer => ({
  id,
  connected: true,
  username: id,
  points,
  streak: 0,
})

const TOP = [
  player("ada", 9_640),
  player("grace", 8_920),
  player("linus", 7_880),
]

const advance = (seconds: number) => {
  act(() => {
    vi.advanceTimersByTime(seconds * 1_000)
  })
}

// A lecture deck reviewing a question over the screen, or ending the review.
const review = (question: number | null) => {
  act(() => {
    useManagerStore.getState().setReview(question)
  })
}

/** Which places have risen, as ranks in order (the DOM runs 2, 1, 3). */
const risen = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-podium-place]")]
    .filter((place) => place.getAttribute("data-up") === "true")
    .map((place) => place.getAttribute("data-podium-place"))
    .sort((a, b) => Number(a) - Number(b))

describe("Podium", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useManagerStore.getState().setVisuals({})
    start.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    useManagerStore.getState().setReview(null)
  })

  it("starts with nobody on the podium", () => {
    const { container } = render(<Podium data={{ subject: "Git", top: TOP }} />)

    expect(container.querySelectorAll("[data-podium-place]")).toHaveLength(3)
    expect(risen(container)).toEqual([])
  })

  it("brings up third, then second, then first, on the score's clock", () => {
    const { container } = render(<Podium data={{ subject: "Git", top: TOP }} />)
    const times = podiumTimes(3)

    advance((times.third ?? 0) + 0.1)
    expect(risen(container)).toEqual(["3"])

    advance((times.second ?? 0) - (times.third ?? 0))
    expect(risen(container)).toEqual(["2", "3"])

    // The roll: first place has not been named, but is about to be.
    advance(times.roll - (times.second ?? 0))
    expect(container.querySelector("[data-podium-envelope]")).not.toBeNull()
    expect(risen(container)).toEqual(["2", "3"])

    advance(times.first - times.roll)
    expect(risen(container)).toEqual(["1", "2", "3"])
    expect(container.querySelector("[data-podium-envelope]")).toBeNull()
  })

  it("fills the frame with the winner's name, then clears it", () => {
    const { container } = render(<Podium data={{ subject: "Git", top: TOP }} />)

    advance(podiumTimes(3).first)
    expect(container.querySelector("[data-podium-winner]")?.textContent).toBe(
      "ada",
    )

    advance(WINNER_FLOOD_MS / 1_000)
    expect(container.querySelector("[data-podium-winner]")).toBeNull()
  })

  it("throws confetti once, then stops", () => {
    const { container } = render(<Podium data={{ subject: "Git", top: TOP }} />)

    advance(podiumTimes(3).first - 0.5)
    expect(container.querySelector("[data-confetti]")).toBeNull()

    advance(0.5)
    expect(container.querySelector("[data-confetti]")).not.toBeNull()

    advance(CONFETTI_MS / 1_000)
    expect(container.querySelector("[data-confetti]")).toBeNull()
  })

  it("keeps the flood and the confetti out of a calm show", () => {
    useManagerStore.getState().setVisuals({ showIntensity: "calm" })

    const { container } = render(<Podium data={{ subject: "Git", top: TOP }} />)

    advance(podiumTimes(3).first + 0.5)

    expect(risen(container)).toEqual(["1", "2", "3"])
    expect(container.querySelector("[data-podium-winner]")).toBeNull()
    expect(container.querySelector("[data-confetti]")).toBeNull()
  })

  it("does not wait through empty places for a room of two", () => {
    const { container } = render(
      <Podium data={{ subject: "Git", top: TOP.slice(0, 2) }} />,
    )
    const times = podiumTimes(2)

    expect(container.querySelectorAll("[data-podium-place]")).toHaveLength(2)

    advance(times.first + 0.1)
    expect(risen(container)).toEqual(["1", "2"])
    expect(times.first).toBeLessThan(podiumTimes(3).first)
  })

  it("crowns a room of one quickly", () => {
    const { container } = render(
      <Podium data={{ subject: "Git", top: TOP.slice(0, 1) }} />,
    )

    advance(podiumTimes(1).first + 0.1)

    expect(risen(container)).toEqual(["1"])
    expect(container.querySelector("[data-podium-winner]")?.textContent).toBe(
      "ada",
    )
  })

  it("shows each place's name and score", () => {
    const { container } = render(<Podium data={{ subject: "Git", top: TOP }} />)

    expect(container.textContent).toContain("grace")
    expect(container.textContent).toContain("8,920")
    expect(container.textContent).toContain("Git")
  })

  it("shows players level on points on the same place, as their phones do", () => {
    const tied = [
      player("ada", 1_766),
      player("grace", 1_766),
      player("linus", 1_765),
    ]
    const { container } = render(
      <Podium data={{ subject: "Git", top: tied }} />,
    )

    const shown = (rank: number) =>
      container
        .querySelector(`[data-podium-place="${rank}"]`)
        ?.getAttribute("data-shown-place")

    // Two tied for first both stand on gold; the next is third, not second.
    expect([shown(1), shown(2), shown(3)]).toEqual(["1", "1", "3"])
  })

  describe("the score", () => {
    it("starts the podium's scene once, for the places filled", () => {
      const { rerender } = render(
        <Podium data={{ subject: "Git", top: TOP }} />,
      )

      expect(start).toHaveBeenCalledTimes(1)
      expect(start).toHaveBeenCalledWith(
        { scene: "podium", places: 3 },
        { silent: false, offsetMs: 0 },
      )

      // Every reveal re-renders the screen; the scene is not asked for again.
      advance(podiumTimes(3).first + 1)
      rerender(<Podium data={{ subject: "Git", top: TOP }} />)

      expect(start).toHaveBeenCalledTimes(1)
    })

    it("asks for fewer places when fewer players finished", () => {
      render(<Podium data={{ subject: "Git", top: TOP.slice(0, 2) }} />)

      expect(start.mock.calls[0][0]).toEqual({ scene: "podium", places: 2 })
    })

    it("keeps a reviewed podium from touching the live game's score", () => {
      useManagerStore.getState().setReview(2)

      render(<Podium data={{ subject: "Git", top: TOP }} />)

      expect(start.mock.calls[0][1]).toEqual({ silent: true, offsetMs: 0 })
    })

    it("does not play the ceremony again when a review over it ends", () => {
      render(<Podium data={{ subject: "Git", top: TOP }} />)

      // A lecture deck reviews a question over the hidden podium for 30 s.
      review(0)
      advance(30)
      review(null)

      // Asked again, the scene is placed where it began, 30 s ago.
      expect(start.mock.calls.at(-1)).toEqual([
        { scene: "podium", places: 3 },
        { silent: false, offsetMs: 30_000 },
      ])
    })
  })
})
