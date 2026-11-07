/**
 * The Director's lit-room model: a projector in a lit classroom lifts black to
 * `1 / contrast` of white, added in linear light. It is the same maths as the
 * plan's `scripts/wash.py`, so the in-browser toggle and the plan's measured
 * numbers agree.
 */

export const ROOM_MODES = [
  { id: "off", label: "Off", contrast: null },
  { id: "lit", label: "Lit room 8:1", contrast: 8 },
  { id: "harsh", label: "Harsh room 5:1", contrast: 5 },
] as const

export type RoomModeId = (typeof ROOM_MODES)[number]["id"]

export type Rgb = readonly [number, number, number]

export const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

export const linearToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

/** Ambient light as a share of white: 8:1 contrast means 0.125. */
export const ambientShare = (contrast: number): number => 1 / contrast

export const washLinear = (linear: number, contrast: number): number => {
  const ambient = ambientShare(contrast)

  return linear * (1 - ambient) + ambient
}

const HEX_PATTERN = /^#([0-9a-f]{6})$/iu

export const parseHex = (hex: string): Rgb => {
  const match = HEX_PATTERN.exec(hex)

  if (!match) {
    throw new Error(`Expected a #rrggbb colour, got "${hex}"`)
  }

  const value = Number.parseInt(match[1], 16)
  const channel = (shift: number) => ((value >> shift) & 255) / 255

  return [channel(16), channel(8), channel(0)]
}

export const toHex = (rgb: Rgb): string =>
  `#${rgb
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`

export const washHex = (hex: string, contrast: number): string => {
  const wash = (channel: number) =>
    linearToSrgb(washLinear(srgbToLinear(channel), contrast))
  const [r, g, b] = parseHex(hex)

  return toHex([wash(r), wash(g), wash(b)])
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export const luminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex).map(srgbToLinear)

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21. */
export const contrastRatio = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)

  return (light + 0.05) / (dark + 0.05)
}

/**
 * Contrast of a pair as the room shows it. Luminance is linear in the channels,
 * so washing the luminance is the same as washing each colour first.
 */
export const washedContrast = (
  foreground: string,
  background: string,
  contrast: number,
): number => {
  const [light, dark] = [luminance(foreground), luminance(background)]
    .map((value) => washLinear(value, contrast))
    .sort((x, y) => y - x)

  return (light + 0.05) / (dark + 0.05)
}

export const roomFilterId = (contrast: number): string =>
  `rz-room-wash-${contrast}`

/**
 * A linear-light transfer function for an SVG `feComponentTransfer`. SVG filters
 * run in linearRGB by default, which is exactly the space the model is in.
 */
export const roomFilterTransfer = (
  contrast: number,
): { slope: number; intercept: number } => ({
  slope: 1 - ambientShare(contrast),
  intercept: ambientShare(contrast),
})
