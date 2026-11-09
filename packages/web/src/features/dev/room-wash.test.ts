import {
  ambientShare,
  contrastRatio,
  linearToSrgb,
  parseHex,
  roomFilterTransfer,
  srgbToLinear,
  washedContrast,
  washHex,
  washLinear,
} from "@razzia/web/features/dev/room-wash"
import { describe, expect, it } from "vitest"

const levels = (hex: string) =>
  parseHex(hex).map((channel) => Math.round(channel * 255))

const widestGap = (a: number[], b: number[]) =>
  Math.max(...a.map((level, index) => Math.abs(level - b[index])))

// Output of wash.py (numpy, truncating to 8 bits) on these swatches. The model
// under test rounds, so a channel may differ by one level and no more.
const REFERENCE: Record<number, Record<string, string>> = {
  8: {
    "#000000": "#636363",
    "#101623": "#646568",
    "#4dffa0": "#78feaf",
    "#bdc3cc": "#c6cbd3",
    "#ffab24": "#feb868",
    "#808080": "#979797",
  },
  5: {
    "#101623": "#7c7d7f",
    "#4dffa0": "#8bfeb8",
    "#42aeff": "#87c1fe",
    "#3ecf8e": "#86d9ac",
  },
}

const referenceCases = () => {
  const cases: Array<readonly [number, string, string]> = []

  for (const [contrast, swatches] of Object.entries(REFERENCE)) {
    for (const [source, expected] of Object.entries(swatches)) {
      cases.push([Number(contrast), source, expected])
    }
  }

  return cases
}

describe("room wash model", () => {
  it("round-trips sRGB through linear light", () => {
    for (const value of [0, 0.02, 0.2, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(value))).toBeCloseTo(value, 6)
    }
  })

  it("lifts black to one over the contrast and leaves white alone", () => {
    expect(ambientShare(8)).toBe(0.125)
    expect(washLinear(0, 8)).toBe(0.125)
    expect(washLinear(1, 8)).toBe(1)
    expect(washHex("#ffffff", 8)).toBe("#ffffff")
    // Wash.py: to_srgb(0.125) * 255 = 99
    expect(washHex("#000000", 8)).toBe("#636363")
  })

  it("matches the plan's scripts/wash.py to within one 8-bit level", () => {
    for (const [contrast, source, expected] of referenceCases()) {
      const got = levels(washHex(source, contrast))

      expect(widestGap(got, levels(expected))).toBeLessThanOrEqual(1)
    }
  })

  it("computes washed contrast from linear luminance", () => {
    // By hand: #101623 has luminance 0.00807, so the room lifts it to
    // 0.00807 * 0.875 + 0.125 = 0.13206 and white sits at 1.05 / 0.18206.
    expect(washedContrast("#ffffff", "#101623", 8)).toBeCloseTo(5.77, 2)
    expect(washedContrast("#000000", "#ffffff", 8)).toBeCloseTo(1.05 / 0.175, 6)
  })

  it("is never kinder than the unwashed screen, and a harsher room is worse", () => {
    const pair: [string, string] = ["#f4f8fc", "#0a0e16"]

    expect(contrastRatio(...pair)).toBeGreaterThan(washedContrast(...pair, 8))
    expect(washedContrast(...pair, 8)).toBeGreaterThan(
      washedContrast(...pair, 5),
    )
  })

  it("derives the SVG transfer from the same ambient share", () => {
    expect(roomFilterTransfer(8)).toEqual({ slope: 0.875, intercept: 0.125 })
    expect(roomFilterTransfer(5)).toEqual({ slope: 0.8, intercept: 0.2 })
  })

  it("rejects colours that are not #rrggbb", () => {
    expect(() => parseHex("#fff")).toThrow()
    expect(() => parseHex("red")).toThrow()
  })
})
