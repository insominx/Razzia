import { describe, expect, it } from "vitest"
import { backgroundAssetPathValidator } from "@razzia/common/validators/visuals"

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
