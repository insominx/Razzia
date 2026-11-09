import {
  evaluateFit,
  FIT_SCREENS,
  FIT_SIZES,
  fitPasses,
  type FitResult,
  type FitRow,
  type FrameMeasurement,
  measureDocument,
  summarizeFit,
} from "@razzia/web/features/dev/fit"
import { describe, expect, it } from "vitest"

const box = (top: number, bottom: number) => ({
  top,
  bottom,
  left: 0,
  right: 100,
})

const measurement = (
  overrides: Partial<FrameMeasurement> = {},
): FrameMeasurement => ({
  client: { width: 1920, height: 1080 },
  scroll: { width: 1920, height: 1080 },
  tiles: [box(800, 900), box(920, 1020)],
  rows: [],
  boxes: [],
  ...overrides,
})

describe("evaluateFit", () => {
  it("passes a page that fits with every tile on screen", () => {
    expect(evaluateFit(measurement())).toMatchObject({
      ok: true,
      overflowX: 0,
      overflowY: 0,
      tilesOffscreen: 0,
    })
  })

  it("reports the page height past the viewport", () => {
    const result = evaluateFit(
      measurement({ scroll: { width: 1920, height: 1233 } }),
    )

    expect(result.ok).toBe(false)
    expect(result.overflowY).toBe(153)
  })

  it("counts tiles below the fold, the C and D of a phone", () => {
    const result = evaluateFit(
      measurement({
        client: { width: 390, height: 844 },
        scroll: { width: 390, height: 1173 },
        tiles: [box(500, 640), box(660, 800), box(820, 960), box(980, 1120)],
      }),
    )

    expect(result.tiles).toBe(4)
    expect(result.tilesOffscreen).toBe(2)
    expect(result.ok).toBe(false)
  })

  it("counts a tile that is only partly cut off", () => {
    const result = evaluateFit(measurement({ tiles: [box(1000, 1090)] }))

    expect(result.tilesOffscreen).toBe(1)
  })

  it("treats sub-pixel rounding as a fit", () => {
    const result = evaluateFit(
      measurement({
        scroll: { width: 1920, height: 1080.9 },
        tiles: [box(800, 1080.8)],
      }),
    )

    expect(result.ok).toBe(true)
  })

  it("flags horizontal overflow and off-screen chart rows", () => {
    const result = evaluateFit(
      measurement({
        scroll: { width: 2000, height: 1080 },
        rows: [box(1100, 1160)],
      }),
    )

    expect(result.overflowX).toBe(80)
    expect(result.rowsOffscreen).toBe(1)
    expect(result.ok).toBe(false)
  })

  it("keeps projector tiles out of the bottom 8%", () => {
    const low = measurement({ tiles: [box(900, 1000)] })

    expect(evaluateFit(low).ok).toBe(true)
    expect(evaluateFit(low, { safeBottomShare: 0.92 })).toMatchObject({
      tilesUnsafe: 1,
      tilesOffscreen: 0,
      ok: false,
    })
    expect(
      evaluateFit(measurement({ tiles: [box(800, 990)] }), {
        safeBottomShare: 0.92,
      }).ok,
    ).toBe(true)
  })

  it("flags a container that holds more than it is tall", () => {
    const result = evaluateFit(
      measurement({
        boxes: [
          { clientHeight: 200, scrollHeight: 200 },
          { clientHeight: 200, scrollHeight: 231 },
        ],
      }),
    )

    expect(result.boxesOverflowing).toBe(1)
    expect(result.ok).toBe(false)
  })

  it("has no tiles and no verdict to give on an empty frame", () => {
    expect(evaluateFit(measurement({ tiles: [] })).ok).toBe(true)
    expect(fitPasses([])).toBe(false)
  })
})

const row = (
  question: number,
  result: Partial<FitResult>,
  where: { size?: string; screen?: FitRow["screen"] } = {},
): FitRow => ({
  quiz: "demo",
  question,
  size: where.size ?? "host-1080",
  screen: where.screen ?? "answers",
  result: {
    overflowX: 0,
    overflowY: 0,
    tiles: 4,
    tilesOffscreen: 0,
    rowsOffscreen: 0,
    tilesUnsafe: 0,
    boxesOverflowing: 0,
    ok: true,
    ...result,
  },
})

describe("summarizeFit", () => {
  it("groups by size and screen and finds the worst question", () => {
    const groups = summarizeFit([
      row(1, {}),
      row(2, { ok: false, overflowY: 40, tilesOffscreen: 1 }),
      row(3, { ok: false, overflowY: 198, tilesOffscreen: 2 }),
      row(1, {}, { size: "phone-844" }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      size: "host-1080",
      screen: "answers",
      total: 3,
      failing: 2,
      worstOverflowY: 198,
      tilesOffscreen: 2,
    })
    expect(groups[0].worst?.question).toBe(3)
    expect(groups[1]).toMatchObject({ size: "phone-844", failing: 0 })
    expect(groups[1].worst).toBeNull()
  })

  it("passes only when every row passes", () => {
    expect(fitPasses([row(1, {}), row(2, {})])).toBe(true)
    expect(fitPasses([row(1, {}), row(2, { ok: false })])).toBe(false)
  })
})

describe("fit matrix", () => {
  it("covers the plan's four sizes, and results only on the host", () => {
    expect(FIT_SIZES.map(({ width, height }) => `${width}x${height}`)).toEqual([
      "1920x1080",
      "1280x720",
      "390x844",
      "360x640",
    ])
    expect(FIT_SCREENS.host).toContain("responses")
    expect(FIT_SCREENS.phone).not.toContain("responses")
  })
})

describe("measureDocument", () => {
  it("collects tiles and rows in document coordinates", () => {
    document.body.innerHTML = `
      <button data-answer-tile>A</button>
      <button>Skip</button>
      <div data-response-row></div>
      <div data-fit-box></div>`

    const result = measureDocument(document, window)

    // Jsdom does no layout, so every box is empty; the selectors are the test.
    expect(result.tiles).toHaveLength(1)
    expect(result.rows).toHaveLength(1)
    expect(result.boxes).toEqual([{ clientHeight: 0, scrollHeight: 0 }])
    expect(result.tiles[0]).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})
