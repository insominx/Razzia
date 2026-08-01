import { describe, expect, it } from "vitest"
import {
  BACKGROUND_IMAGE_EXTENSION_PATTERN,
  BACKGROUND_UPLOAD_MIME_TYPES,
  contentTypeForExtension,
  extensionForMime,
  isBackgroundImageMime,
} from "@razzia/common/utils/background-image"

describe("background image mime table", () => {
  it("exposes the four allowlisted mime types", () => {
    expect(BACKGROUND_UPLOAD_MIME_TYPES).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ])
  })

  it("maps mime ↔ extension ↔ content-type from one table", () => {
    expect(extensionForMime("image/png")).toBe("png")
    expect(extensionForMime("image/jpeg")).toBe("jpg")
    expect(contentTypeForExtension(".png")).toBe("image/png")
    expect(contentTypeForExtension("jpeg")).toBe("image/jpeg")
    expect(isBackgroundImageMime("image/svg+xml")).toBe(false)
    expect(BACKGROUND_IMAGE_EXTENSION_PATTERN.test("room.PNG")).toBe(true)
    expect(BACKGROUND_IMAGE_EXTENSION_PATTERN.test("notes.txt")).toBe(false)
  })
})
