import { describe, expect, it } from "vitest"
import {
  DARK_PHOTO_LUMINANCE,
  isDarkPhoto,
} from "@razzia/web/features/visuals/photo-luminance"

describe("isDarkPhoto", () => {
  it("treats a navy abstract as dark and a classroom as not", () => {
    expect(isDarkPhoto(38)).toBe(true)
    expect(isDarkPhoto(DARK_PHOTO_LUMINANCE - 1)).toBe(true)
    expect(isDarkPhoto(DARK_PHOTO_LUMINANCE)).toBe(false)
    expect(isDarkPhoto(140)).toBe(false)
    expect(isDarkPhoto(null)).toBe(false)
  })
})
