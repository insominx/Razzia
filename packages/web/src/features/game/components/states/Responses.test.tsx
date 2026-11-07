import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import {
  RESULT_COUNT_MS,
  RESULT_HEADLINE_MS,
  RESULT_SETTLED_MS,
  RESULT_SPOTLIGHT_MS,
  RESULT_STRIKE_MS,
} from "@razzia/common/utils/result-reveal"
import type { SceneOptions, SceneSpec } from "@razzia/web/features/game/audio"
import { anchorOf, originMs } from "@razzia/web/features/game/audio/scenes"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { act, cleanup, render, screen } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { start } = vi.hoisted(() => ({ start: vi.fn() }))

// The score is the audio module's job (it has its own tests); here a screen is
// judged by which scene it asks for, and when.
vi.mock("@razzia/web/features/game/audio", async () => ({
  // The scene builder is pure and is the thing under test's input; the engine
  // behind the score is not needed to judge which scene a screen asks for.
  verdictSpec: (await import("@razzia/web/features/game/audio/scenes"))
    .verdictSpec,
  score: { start, cue: vi.fn(), stop: vi.fn() },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
    i18n: { language: "en" },
  }),
}))

const DATA: ManagerStatusDataMap["SHOW_RESPONSES"] = {
  question: "Which one?",
  questionNumber: 7,
  answers: ["Alpha", "Beta", "Gamma", "Delta"],
  responses: { 0: 12, 1: 2, 2: 3, 3: 1 },
  solutions: [0],
}

const renderResponses = async (
  data: ManagerStatusDataMap["SHOW_RESPONSES"] = DATA,
) => {
  const { default: Responses } =
    await import("@razzia/web/features/game/components/states/Responses")

  return render(<Responses data={data} />)
}

const tileOf = (label: string): HTMLElement => {
  const tile = document.querySelector<HTMLElement>(
    `[data-answer-tile][data-answer="${label}"]`,
  )

  if (!tile) {
    throw new Error(`no tile for ${label}`)
  }

  return tile
}

const railOf = (tile: HTMLElement): HTMLElement => {
  const bar = tile.querySelector<HTMLElement>(".rz-tile-bar")

  if (!bar) {
    throw new Error("no rail")
  }

  return bar
}

const shareOf = (tile: HTMLElement): string =>
  tile.querySelector(".rz-tile-share")?.textContent ?? ""

describe("Responses", () => {
  // `globals` is off, so RTL never registers its own teardown and each render
  // would otherwise stack another copy of the screen onto the same body.
  beforeEach(() => {
    cleanup()
    start.mockClear()
  })

  it("keeps the shared question number above the response question", async () => {
    await renderResponses()

    expect(
      document.querySelector(
        '[data-question-number-layout="game-question-number"]',
      ),
    ).toHaveAttribute("data-question-number-phase", "settled")
  })

  it("puts each answer's share in its own letter block and runs the rail by it", async () => {
    await renderResponses()

    expect(["A", "B", "C", "D"].map((label) => shareOf(tileOf(label)))).toEqual(
      ["67%", "11%", "17%", "6%"],
    )
    expect(
      ["A", "B", "C", "D"].map((label) => railOf(tileOf(label)).style.width),
    ).toEqual(["67%", "11%", "17%", "6%"])
  })

  it("frames the solution as correct and steps the rest back", async () => {
    await renderResponses()

    expect(tileOf("A")).toHaveAttribute("data-state", "correct")
    expect(tileOf("A").querySelector("[role='img']")).toHaveAttribute(
      "aria-label",
      "Correct",
    )
    for (const label of ["B", "C", "D"]) {
      expect(tileOf(label)).toHaveAttribute("data-state", "wrong")
      expect(tileOf(label).querySelector("[role='img']")).toBeNull()
    }
  })

  it("frames every solution of a question that has several", async () => {
    await renderResponses({ ...DATA, solutions: [0, 2] })

    expect(
      ["A", "B", "C", "D"].map((label) => tileOf(label).dataset.state),
    ).toEqual(["correct", "wrong", "correct", "wrong"])
  })

  it("still frames the empty solution when the crowd picked a wrong slot", async () => {
    await renderResponses({
      ...DATA,
      responses: { 1: 5 },
      solutions: [2],
    })

    expect(tileOf("C")).toHaveAttribute("data-state", "correct")
    expect(shareOf(tileOf("C"))).toBe("0%")
    expect(railOf(tileOf("C")).style.width).toBe("0%")
    expect(tileOf("B")).toHaveAttribute("data-state", "wrong")
    expect(shareOf(tileOf("B"))).toBe("100%")
  })

  it("takes its colour from the answer, not from the verdict", async () => {
    await renderResponses()

    expect(tileOf("A").style.getPropertyValue("--c")).toBe("var(--rz-answer-a)")
    expect(tileOf("C").style.getPropertyValue("--c")).toBe("var(--rz-answer-c)")
  })

  it("is a panel, not a set of buttons: nothing here can be tapped", async () => {
    await renderResponses()

    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(document.querySelectorAll("[data-answer-tile]")).toHaveLength(4)
    for (const tile of document.querySelectorAll("[data-answer-tile]")) {
      expect(tile.tagName).toBe("DIV")
    }
  })

  // Effects never run in a server render, so this is the one place that can
  // tell a render-time derivation apart from a state write in `useEffect`
  // (which `render` would flush before any assertion could see the gap).
  it("has the widths on the very first paint, before any effect", async () => {
    const { default: Responses } =
      await import("@razzia/web/features/game/components/states/Responses")

    const markup = renderToStaticMarkup(<Responses data={DATA} />)

    expect(markup).toContain("width:67%")
    expect(markup).toContain("width:11%")
    expect(markup).toContain("width:17%")
    expect(markup).toContain("width:6%")
  })

  // A width has no "auto" that reads as empty: an unset one fills the whole
  // track, so an unanswered question has to land on an explicit zero, once for
  // a key that is missing entirely and once for a key that is present but
  // zero, which used to divide by zero into `NaN%`.
  it("renders empty rails when nobody answered", async () => {
    await renderResponses({ ...DATA, responses: {} })

    expect(
      ["A", "B", "C", "D"].map((label) => railOf(tileOf(label)).style.width),
    ).toEqual(["0%", "0%", "0%", "0%"])
    expect(["A", "B", "C", "D"].map((label) => shareOf(tileOf(label)))).toEqual(
      ["0%", "0%", "0%", "0%"],
    )
  })

  it("renders empty rails when every answer drew a zero", async () => {
    await renderResponses({ ...DATA, responses: { 0: 0, 1: 0, 2: 0, 3: 0 } })

    expect(
      ["A", "B", "C", "D"].map((label) => railOf(tileOf(label)).style.width),
    ).toEqual(["0%", "0%", "0%", "0%"])
  })

  it("asks for the verdict scene once, from the server's stamps", async () => {
    const data = staged({ responses: { 0: 3, 1: 8, 2: 4, 3: 2 } })
    const { rerender } = await renderResponses(data)
    const { default: Responses } =
      await import("@razzia/web/features/game/components/states/Responses")

    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(
      {
        scene: "verdict",
        resultsAt: data.resultsAt,
        serverNow: data.serverNow,
        votes: [3, 8, 4, 2],
        // Most picked is B, and B is not the answer: the crowd fell for it.
        outcome: "wrong",
      },
      { silent: false },
    )

    // The same screen again is the same scene: nothing restarts.
    rerender(<Responses data={data} />)

    expect(start).toHaveBeenCalledTimes(1)
  })

  it("says the crowd was right when the most-picked answer is a solution", async () => {
    await renderResponses(staged())

    expect(start.mock.calls[0][0]).toMatchObject({ outcome: "right" })
  })

  it("keeps a reviewed question from touching the live game's score", async () => {
    useManagerStore.getState().setReview(3)

    await renderResponses(staged())

    expect(start.mock.calls[0][1]).toEqual({ silent: true })
  })

  it("asks for no scene when the result has no stamps to stage", async () => {
    await renderResponses(DATA)

    expect(start).not.toHaveBeenCalled()
  })
})

// The staged verdict, on a clock the tests move by hand.
const staged = (
  overrides: Partial<ManagerStatusDataMap["SHOW_RESPONSES"]> = {},
): ManagerStatusDataMap["SHOW_RESPONSES"] => ({
  ...DATA,
  totalPlayers: 18,
  resultsAt: Date.now(),
  serverNow: Date.now(),
  ...overrides,
})

const phaseOf = () =>
  document.querySelector<HTMLElement>("[data-reveal]")?.dataset.phase

const states = () =>
  [...document.querySelectorAll<HTMLElement>("[data-answer-tile]")].map(
    (tile) => tile.dataset.state,
  )

const spotted = () =>
  [...document.querySelectorAll<HTMLElement>("[data-spot]")].map(
    (tile) => tile.dataset.answer,
  )

describe("Responses staged verdict", () => {
  beforeEach(() => {
    cleanup()
    start.mockClear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"))
    useManagerStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms)
    })

  it("keeps the verdict in the past when a review over the hidden screen ends", async () => {
    const data = staged()
    const arrivedAt = Date.now()
    await renderResponses(data)

    advance(2_000)
    act(() => useManagerStore.getState().setReview(2))
    advance(30_000)
    act(() => useManagerStore.getState().setReview(null))

    const [spec, options] = start.mock.calls.at(-1) as [SceneSpec, SceneOptions]

    expect(options).toMatchObject({ silent: false })
    // Where the score puts it: on the beat it always had, half a minute ago,
    // so nothing of it plays again over the settled grid.
    expect(originMs(anchorOf(spec) ?? null, Date.now(), options.offsetMs)).toBe(
      arrivedAt + (data.resultsAt ?? 0) - (data.serverNow ?? 0),
    )
  })

  it("takes the whole frame for TIME, then clears it", async () => {
    await renderResponses(staged({ totalPlayers: 25 }))

    expect(phaseOf()).toBe("time")
    expect(document.querySelector("[data-hit='time']")).toHaveTextContent(
      "game:reveal.time",
    )

    advance(RESULT_COUNT_MS + 50)

    expect(phaseOf()).toBe("count")
    expect(document.querySelector("[data-hit]")).toBeNull()
  })

  it("says ALL IN when everyone answered before the clock ran out", async () => {
    await renderResponses(staged({ totalPlayers: 18 }))

    expect(document.querySelector("[data-hit='time']")).toHaveTextContent(
      "game:reveal.allIn",
    )
  })

  it("holds the verdict back: no tile is right or wrong until the strike", async () => {
    await renderResponses(staged())

    advance(RESULT_STRIKE_MS - 100)

    expect(phaseOf()).toBe("spotlight")
    expect(states()).toEqual(["result", "result", "result", "result"])
  })

  it("grows the shares in as the rails go, then shows them whole", async () => {
    await renderResponses(staged())
    const share = (label: string) =>
      document.querySelector(`[data-answer="${label}"] .rz-tile-share`)
        ?.textContent

    // Not yet counting: the block shows only its letter.
    expect(share("A")).toBeUndefined()

    advance(RESULT_COUNT_MS + 100)
    expect(share("A")).toBeDefined()
    expect(Number.parseInt(share("A") ?? "0", 10)).toBeLessThan(67)

    advance(RESULT_SPOTLIGHT_MS)
    expect(share("A")).toBe("67%")
  })

  it("holds the most-picked answer in the light while the room waits", async () => {
    await renderResponses(staged())

    expect(spotted()).toEqual([])

    advance(RESULT_SPOTLIGHT_MS + 50)

    expect(phaseOf()).toBe("spotlight")
    expect(spotted()).toEqual(["A"])
  })

  it("keeps every tied answer lit", async () => {
    await renderResponses(
      staged({ responses: { 0: 5, 1: 5, 2: 2, 3: 0 }, totalPlayers: 12 }),
    )

    advance(RESULT_SPOTLIGHT_MS + 50)

    expect(spotted()).toEqual(["A", "B"])
  })

  it("floods the frame from the right answer on the strike, then settles", async () => {
    await renderResponses(staged())

    advance(RESULT_STRIKE_MS + 50)

    expect(phaseOf()).toBe("strike")
    expect(states()).toEqual(["correct", "wrong", "wrong", "wrong"])
    expect(document.querySelector("[data-hit='strike']")).toHaveTextContent(
      "Alpha",
    )
    expect(spotted()).toEqual([])

    advance(RESULT_SETTLED_MS - RESULT_STRIKE_MS)

    expect(phaseOf()).toBe("settled")
    expect(document.querySelector("[data-hit]")).toBeNull()
    expect(states()).toEqual(["correct", "wrong", "wrong", "wrong"])
  })

  it("names every right answer in the flood when there are several", async () => {
    await renderResponses(staged({ solutions: [0, 2] }))

    advance(RESULT_STRIKE_MS + 50)

    const flood = document.querySelector("[data-hit='strike']")

    expect(flood).toHaveTextContent("Alpha")
    expect(flood).toHaveTextContent("Gamma")
    expect(flood).not.toHaveTextContent("Beta")
  })

  it("lands the headline after the strike, naming who was fooled", async () => {
    // Most of the room picked B, which is wrong; three picked the right A.
    await renderResponses(
      staged({ responses: { 0: 3, 1: 8, 2: 4, 3: 2 }, totalPlayers: 18 }),
    )
    const headline = () => document.querySelector("[data-headline]")

    expect(headline()).not.toHaveAttribute("data-shown")

    advance(RESULT_HEADLINE_MS + 50)

    expect(headline()).toHaveAttribute("data-shown")
    expect(headline()).toHaveTextContent("game:reveal.headline.crowdWrong")
    expect(headline()?.textContent).toContain('"right":3')
    expect(headline()?.textContent).toContain('"of":18')
    expect(headline()?.textContent).toContain('"wrong":8')
    expect(headline()?.textContent).toContain('"letters":"B"')
  })

  it("says it plainly when the crowd was right", async () => {
    await renderResponses(staged())

    advance(RESULT_HEADLINE_MS + 50)

    expect(document.querySelector("[data-headline]")).toHaveTextContent(
      "game:reveal.headline.crowdRight",
    )
  })

  it("names the fastest player, a beat after the headline", async () => {
    await renderResponses(
      staged({ fastest: { username: "Ada", seconds: 2.2 } }),
    )

    advance(RESULT_HEADLINE_MS + 20)
    expect(document.querySelector("[data-fastest]")).not.toHaveAttribute(
      "data-shown",
    )

    advance(200)
    expect(document.querySelector("[data-fastest]")).toHaveAttribute(
      "data-shown",
    )
    expect(document.querySelector("[data-fastest]")?.textContent).toContain(
      "Ada",
    )
  })

  it("is the final grid at once for a reconnect after the reveal: no flood", async () => {
    const now = Date.now()

    await renderResponses(staged({ resultsAt: now - 60_000, serverNow: now }))

    expect(phaseOf()).toBe("settled")
    expect(document.querySelector("[data-hit]")).toBeNull()
    expect(document.querySelector("[data-headline]")).toHaveAttribute(
      "data-shown",
    )
    expect(document.querySelector("[data-answer='A']")).toHaveAttribute(
      "data-state",
      "correct",
    )
  })

  it("joins a reconnect part-way, from the stamps", async () => {
    const now = Date.now()

    await renderResponses(staged({ resultsAt: now - 3_300, serverNow: now }))

    expect(phaseOf()).toBe("strike")
  })

  describe("in Calm", () => {
    beforeEach(() => {
      useManagerStore.getState().setVisuals({ showIntensity: "calm" })
    })

    it("has no full-frame hit: the verdict happens on the tile", async () => {
      await renderResponses(staged())

      expect(document.querySelector("[data-hit]")).toBeNull()
      expect(document.querySelector("[data-reveal]")).toHaveAttribute(
        "data-calm",
      )

      advance(RESULT_STRIKE_MS + 50)

      expect(document.querySelector("[data-hit]")).toBeNull()
      expect(document.querySelector("[data-answer='A']")).toHaveAttribute(
        "data-state",
        "correct",
      )
    })

    it("says TIME in the headline's place instead of flooding the frame", async () => {
      await renderResponses(staged())

      expect(document.querySelector("[data-time-label]")).toHaveTextContent(
        "game:reveal.allIn",
      )

      advance(RESULT_COUNT_MS + 50)

      expect(document.querySelector("[data-time-label]")).toBeNull()
    })
  })
})
