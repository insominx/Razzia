import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  BACKGROUND_UPLOAD_ACCEPT,
  BACKGROUND_UPLOAD_MAX_BYTES,
  uploadBackgroundViaHttp,
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
    const big = new File(
      [new Uint8Array(BACKGROUND_UPLOAD_MAX_BYTES + 1)],
      "x.png",
      { type: "image/png" },
    )
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

describe("uploadBackgroundViaHttp", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("posts to setGlobal query when requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ref: { kind: "config-asset", path: "a.png" },
          url: "/config-assets/backgrounds/a.png",
        }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const file = new File(["ok"], "a.png", { type: "image/png" })
    await uploadBackgroundViaHttp(file, "client-1", { setGlobal: true })

    const headersMatcher: unknown = expect.objectContaining({
      "X-Client-Id": "client-1",
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/config-assets/backgrounds?setGlobal=1",
      expect.objectContaining({
        method: "POST",
        headers: headersMatcher,
      }),
    )
  })
})

describe("uploadBackgroundViaHttp failures", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("sends a header-safe name for a non-Latin-1 file name", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      // The real fetch throws when a header value holds such a character.
      void new Headers(init.headers)

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ref: {}, url: "/u.png" }),
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const file = new File(["ok"], "фото 日本 .png", { type: "image/png" })

    await expect(
      uploadBackgroundViaHttp(file, "client-1"),
    ).resolves.toBeDefined()
  })

  it("maps a non-JSON proxy page to the upload failure key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.reject(new SyntaxError("Unexpected token <")),
      }),
    )

    const file = new File(["ok"], "a.png", { type: "image/png" })

    await expect(uploadBackgroundViaHttp(file, "client-1")).rejects.toThrow(
      "errors:visuals.backgroundUploadFailed",
    )
  })

  it("maps a network failure to the upload failure key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    )

    const file = new File(["ok"], "a.png", { type: "image/png" })

    await expect(uploadBackgroundViaHttp(file, "client-1")).rejects.toThrow(
      "errors:visuals.backgroundUploadFailed",
    )
  })
})
