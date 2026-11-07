import { describe, expect, it } from "vitest"
import {
  backgroundAssetPathValidator,
  soundThemeValidator,
} from "@razzia/common/validators/visuals"

describe("backgroundAssetPathValidator", () => {
  it("accepts safe image basenames", () => {
    expect(backgroundAssetPathValidator.parse("room-abc123.png")).toBe(
      "room-abc123.png",
    )
    expect(backgroundAssetPathValidator.parse("photo.JPEG")).toBe("photo.JPEG")
    expect(backgroundAssetPathValidator.parse("x.webp")).toBe("x.webp")
  })

  it("rejects path traversal and public prefixes", () => {
    for (const path of [
      "../secret.png",
      "/etc/passwd",
      "dir/file.png",
      "file\\name.png",
      "C:file.png",
      "config-assets/x.png",
      "/config-assets/x.png",
    ]) {
      expect(backgroundAssetPathValidator.safeParse(path).success).toBe(false)
    }
  })

  it("rejects non-image extensions even when basename-safe", () => {
    expect(backgroundAssetPathValidator.safeParse("payload.exe").success).toBe(
      false,
    )
    expect(backgroundAssetPathValidator.safeParse("notes.txt").success).toBe(
      false,
    )
    expect(backgroundAssetPathValidator.safeParse("noext").success).toBe(false)
  })
})

describe("soundThemeValidator", () => {
  it("accepts the two mp3 packs and the generated show score", () => {
    for (const theme of ["classic", "techno", "show"]) {
      expect(soundThemeValidator.parse(theme)).toBe(theme)
    }
  })

  it("rejects an unknown pack", () => {
    expect(soundThemeValidator.safeParse("neon-disco").success).toBe(false)
  })
})
