import { describe, expect, it } from "vitest"
import { detectImageMimeType } from "@razzia/common/utils/image-bytes"

describe("detectImageMimeType", () => {
  it("detects PNG magic bytes", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ])
    expect(detectImageMimeType(png)).toBe("image/png")
  })

  it("detects JPEG magic bytes", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
    expect(detectImageMimeType(jpeg)).toBe("image/jpeg")
  })

  it("detects GIF and WebP magic bytes", () => {
    expect(detectImageMimeType(Buffer.from("GIF89a...."))).toBe("image/gif")
    const webp = Buffer.from("RIFF....WEBP....")
    expect(detectImageMimeType(webp)).toBe("image/webp")
  })

  it("returns null for unknown payloads", () => {
    expect(detectImageMimeType(Buffer.from("not-an-image"))).toBeNull()
  })
})
