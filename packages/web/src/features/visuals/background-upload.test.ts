import { describe, expect, it } from "vitest"
import {
  BACKGROUND_UPLOAD_ACCEPT,
  BACKGROUND_UPLOAD_MAX_BYTES,
  validateBackgroundFile,
} from "@razzia/web/features/visuals/background-upload"

describe("validateBackgroundFile", () => {
  it("rejects non-allowlisted types before upload", () => {
    const file = new File(["x"], "x.svg", { type: "image/svg+xml" })
    expect(validateBackgroundFile(file)).toEqual({
      ok: false,
      error: "errors:visuals.unsupportedBackgroundType",
    })
  })

  it("rejects files over 5MB", () => {
    const big = new File([new Uint8Array(BACKGROUND_UPLOAD_MAX_BYTES + 1)], "x.png", {
      type: "image/png",
    })
    expect(validateBackgroundFile(big)).toEqual({
      ok: false,
      error: "errors:visuals.backgroundTooLarge",
    })
  })

  it("accepts png/jpeg/webp/gif under the size limit", () => {
    for (const type of BACKGROUND_UPLOAD_ACCEPT) {
      const file = new File(["ok"], `x.${type.split("/")[1]}`, { type })
      expect(validateBackgroundFile(file)).toEqual({ ok: true })
    }
  })
})
