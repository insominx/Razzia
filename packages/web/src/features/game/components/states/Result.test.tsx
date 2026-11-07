import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import {
  RESULT_PHONE_DETAILS_MS,
  RESULT_STRIKE_MS,
} from "@razzia/common/utils/result-reveal"
import Result from "@razzia/web/features/game/components/states/Result"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { haptic } from "@razzia/web/features/game/utils/haptics"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { start } = vi.hoisted(() => ({ start: vi.fn() }))

// The score has its own tests; here a screen is judged by what it asks of it.
vi.mock("@razzia/web/features/game/audio/score", () => ({
  score: { start },
}))

vi.mock("@razzia/web/features/game/utils/haptics", () => ({
  HAPTIC: { correct: "correct", wrong: "wrong" },
  haptic: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

vi.mock("@razzia/web/features/game/hooks/use-show-intensity", () => ({
  useCalmVisuals: () => calm.on,
}))

const calm = vi.hoisted(() => ({ on: false }))

const stage = () =>
  document.querySelector<HTMLElement>("[data-result-stage]")?.dataset
    .resultStage

const result = (
  overrides: Partial<CommonStatusDataMap["SHOW_RESULT"]> = {},
): CommonStatusDataMap["SHOW_RESULT"] => ({
  correct: true,
  message: "game:correct",
  points: 850,
  myPoints: 850,
  rank: 1,
  aheadOfMe: null,
  ...overrides,
})

const live = (
  overrides: Partial<CommonStatusDataMap["SHOW_RESULT"]> = {},
): CommonStatusDataMap["SHOW_RESULT"] =>
  result({ resultsAt: Date.now(), serverNow: Date.now(), ...overrides })

describe("Result", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"))
    vi.clearAllMocks()
    calm.on = false
    usePlayerStore.getState().reset()
    usePlayerStore.getState().setPlayer({ username: "Ada", points: 100 })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms)
    })

  describe("a live verdict", () => {
    it("holds while the room builds up to it: nothing to read yet", () => {
      render(<Result data={live()} />)

      expect(stage()).toBe("hold")
      expect(screen.queryByText("game:correct")).not.toBeInTheDocument()
      expect(haptic).not.toHaveBeenCalled()
    })

    it("asks for the strike's chord on the same stamps as the room's, in the verdict's key", () => {
      const data = live()

      render(<Result data={data} />)

      expect(start).toHaveBeenCalledTimes(1)
      expect(start).toHaveBeenCalledWith(
        {
          scene: "strike",
          resultsAt: data.resultsAt,
          serverNow: data.serverNow,
          outcome: "right",
        },
        { silent: false },
      )
    })

    it("floods the phone with the verdict's colour and a glyph, on the strike", () => {
      render(<Result data={live()} />)

      advance(RESULT_STRIKE_MS + 100)

      expect(stage()).toBe("struck")
      expect(document.querySelector("[data-hit='verdict']")).not.toBeNull()
      expect(
        document.querySelector<HTMLElement>("[data-hit='verdict']")?.style
          .cssText,
      ).toContain("#34d98b")
      // Colour and glyph and nothing else: the words wait two seconds.
      expect(document.querySelector("[data-result-details]")).toBeNull()
    })

    it("buzzes and sounds once, on the strike and not before", () => {
      render(<Result data={live()} />)

      advance(RESULT_STRIKE_MS - 100)
      expect(haptic).not.toHaveBeenCalled()

      advance(200)
      expect(haptic).toHaveBeenCalledTimes(1)
      expect(haptic).toHaveBeenCalledWith("correct")

      advance(RESULT_PHONE_DETAILS_MS)
      expect(haptic).toHaveBeenCalledTimes(1)
    })

    it("buzzes the wrong pattern for a wrong answer", () => {
      render(
        <Result
          data={live({ correct: false, message: "game:wrong", picked: 1 })}
        />,
      )

      advance(RESULT_STRIKE_MS + 100)

      expect(haptic).toHaveBeenCalledWith("wrong")
    })

    it("adds the words two seconds later: points, streak, and where you stand", () => {
      render(<Result data={live({ streak: 3, rank: 2, aheadOfMe: "Grace" })} />)

      advance(RESULT_PHONE_DETAILS_MS + 100)

      expect(stage()).toBe("details")
      expect(document.querySelector("[data-hit]")).toBeNull()
      expect(screen.getByText("game:correct")).toBeInTheDocument()
      expect(screen.getByText("+850")).toBeInTheDocument()
      expect(screen.getByText(/game:streak/u)).toHaveTextContent('"count":3')
      expect(screen.getByText(/game:standingBehind/u).textContent).toContain(
        '"name":"Grace"',
      )
    })

    it("shows no streak for a single right answer", () => {
      render(<Result data={live({ streak: 1 })} />)

      advance(RESULT_PHONE_DETAILS_MS + 100)

      expect(screen.queryByText(/game:streak/u)).not.toBeInTheDocument()
    })

    it("calls a tie on points a tie, not a place behind", () => {
      render(
        <Result
          data={live({ rank: 14, aheadOfMe: "Grace", behind: 0, picked: 1 })}
        />,
      )

      advance(RESULT_PHONE_DETAILS_MS + 100)

      expect(screen.queryByText(/game:standingBehind/u)).not.toBeInTheDocument()
      expect(screen.getByText(/game:standing:/u)).toHaveTextContent(
        '"place":"game:rank',
      )
      expect(screen.getByText(/game:standingLevel/u)).toHaveTextContent(
        '"name":"Grace"',
      )
    })

    it("still says behind for a real gap", () => {
      render(
        <Result data={live({ rank: 14, aheadOfMe: "Grace", behind: 120 })} />,
      )

      advance(RESULT_PHONE_DETAILS_MS + 100)

      expect(screen.getByText(/game:standingBehind/u)).toBeInTheDocument()
      expect(screen.queryByText(/game:standingLevel/u)).not.toBeInTheDocument()
    })

    it("says where you stand plainly in first place", () => {
      render(<Result data={live()} />)

      advance(RESULT_PHONE_DETAILS_MS + 100)

      expect(screen.getByText(/game:standing:/u)).toBeInTheDocument()
      expect(screen.queryByText(/game:standingBehind/u)).not.toBeInTheDocument()
    })

    it("tells a player who missed what the right answer was", () => {
      render(
        <Result
          data={live({
            correct: false,
            message: "game:wrong",
            points: 0,
            picked: 1,
            correctAnswers: ["The road end"],
          })}
        />,
      )

      advance(RESULT_STRIKE_MS + 100)
      expect(
        document.querySelector<HTMLElement>("[data-hit='verdict']")?.style
          .cssText,
      ).toContain("#ff6a58")

      advance(RESULT_PHONE_DETAILS_MS)

      expect(screen.getByText("game:wrong")).toBeInTheDocument()
      expect(screen.getByText("game:itWas")).toBeInTheDocument()
      expect(screen.getByText("The road end")).toBeInTheDocument()
      expect(screen.queryByText("+0")).not.toBeInTheDocument()
    })

    it("has its own verdict, in grey, for a player who did not answer", () => {
      render(
        <Result
          data={live({
            correct: false,
            message: "game:wrong",
            points: 0,
            picked: null,
            correctAnswers: ["The road end"],
          })}
        />,
      )

      advance(RESULT_STRIKE_MS + 100)
      expect(
        document.querySelector<HTMLElement>("[data-hit='verdict']")?.style
          .cssText,
      ).toContain("#aab4c4")

      advance(RESULT_PHONE_DETAILS_MS)

      expect(screen.getByText("game:noAnswer")).toBeInTheDocument()
      expect(screen.queryByText("game:wrong")).not.toBeInTheDocument()
      expect(screen.getByText("The road end")).toBeInTheDocument()
      expect(
        document.querySelector("[data-verdict]")?.getAttribute("data-verdict"),
      ).toBe("none")
    })

    it("keeps the footer's score back until the details, so it gives nothing away", () => {
      render(<Result data={live({ myPoints: 950 })} />)

      advance(RESULT_STRIKE_MS + 100)
      expect(usePlayerStore.getState().player?.points).toBe(100)

      advance(RESULT_PHONE_DETAILS_MS)
      expect(usePlayerStore.getState().player?.points).toBe(950)
    })

    it("settles the score if the screen goes before the details do", () => {
      const { unmount } = render(<Result data={live({ myPoints: 950 })} />)

      expect(usePlayerStore.getState().player?.points).toBe(100)

      unmount()

      expect(usePlayerStore.getState().player?.points).toBe(950)
    })
  })

  describe("in Calm", () => {
    beforeEach(() => {
      calm.on = true
    })

    it("has no flood: the glyph and the verdict simply appear on the strike", () => {
      render(<Result data={live()} />)

      advance(RESULT_STRIKE_MS + 100)

      expect(stage()).toBe("struck")
      expect(document.querySelector("[data-hit]")).toBeNull()
      expect(screen.getByText("game:correct")).toBeInTheDocument()
      expect(document.querySelector("[data-result-details]")).toBeNull()
    })
  })

  describe("arriving late", () => {
    it("shows everything at once, and makes no sound or buzz: a woken phone", () => {
      const now = Date.now()

      render(
        <Result data={result({ resultsAt: now - 60_000, serverNow: now })} />,
      )

      expect(stage()).toBe("details")
      expect(document.querySelector("[data-hit]")).toBeNull()
      expect(haptic).not.toHaveBeenCalled()
      // The strike is long past: the score is told to stay out of it.
      expect(start.mock.calls[0][1]).toEqual({ silent: true })
    })

    it("joins part-way: struck, not yet detailed", () => {
      const now = Date.now()

      render(
        <Result data={result({ resultsAt: now - 3_500, serverNow: now })} />,
      )

      expect(stage()).toBe("struck")
      // Late, so no buzz: it already happened on every other phone.
      expect(haptic).not.toHaveBeenCalled()
    })

    it("shows an unstamped result, as a lecture's saved one is, settled", () => {
      render(<Result data={result()} />)

      expect(stage()).toBe("details")
      expect(haptic).not.toHaveBeenCalled()
    })
  })

  describe("a lecture", () => {
    it("tells a lecture's players what comes next", () => {
      render(<Result data={result({ note: "game:lectureNextQuestion" })} />)

      expect(screen.getByText("game:lectureNextQuestion")).toBeInTheDocument()
    })

    it("adds nothing in a normal game", () => {
      render(<Result data={result()} />)

      expect(screen.queryByText(/lecture/u)).not.toBeInTheDocument()
    })
  })
})
