import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import type { IncomingMessage, ServerResponse } from "http"

const tempRoots: string[] = []

beforeEach(() => {
  vi.resetModules()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-visuals-"))
  tempRoots.push(root)
  process.env.CONFIG_PATH = root
  fs.mkdirSync(path.join(root, "assets/backgrounds"), { recursive: true })
})

afterEach(() => {
  delete process.env.CONFIG_PATH
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])

describe("storeBackgroundAsset", () => {
  it("sniffs magic bytes and rejects mismatched mime claims", async () => {
    const { storeBackgroundAsset } = await import(
      "@razzia/socket/services/visuals"
    )

    expect(() =>
      storeBackgroundAsset({
        fileName: "fake.png",
        mimeType: "image/png",
        dataBase64: Buffer.from("not-an-image").toString("base64"),
      }),
    ).toThrow("errors:visuals.unsupportedBackgroundType")
  })

  it("stores a real PNG and returns a public url", async () => {
    const { storeBackgroundAsset, getBackgroundAssetPath } = await import(
      "@razzia/socket/services/visuals"
    )

    const uploaded = storeBackgroundAsset({
      fileName: "room.png",
      mimeType: "image/png",
      dataBase64: pngBytes.toString("base64"),
    })

    expect(uploaded.ref.kind).toBe("config-asset")
    expect(uploaded.ref.path.endsWith(".png")).toBe(true)
    expect(uploaded.url).toContain("/config-assets/backgrounds/")
    expect(fs.existsSync(getBackgroundAssetPath(uploaded.ref.path)!)).toBe(true)
  })
})

describe("delete-on-replace helpers", () => {
  it("replaces a background and deletes the previous asset file", async () => {
    const {
      storeBackgroundAsset,
      replaceBackgroundAsset,
      getBackgroundAssetPath,
    } = await import("@razzia/socket/services/visuals")

    const first = storeBackgroundAsset({
      fileName: "one.png",
      mimeType: "image/png",
      dataBase64: pngBytes.toString("base64"),
    })
    const firstPath = getBackgroundAssetPath(first.ref.path)!

    const second = replaceBackgroundAsset(first.ref, {
      fileName: "two.png",
      mimeType: "image/png",
      dataBase64: pngBytes.toString("base64"),
    })

    expect(fs.existsSync(firstPath)).toBe(false)
    expect(fs.existsSync(getBackgroundAssetPath(second.ref.path)!)).toBe(true)
  })
})

describe("serveConfigAsset", () => {
  it("sets X-Content-Type-Options: nosniff", async () => {
    const { storeBackgroundAsset, serveConfigAsset } = await import(
      "@razzia/socket/services/visuals"
    )
    const uploaded = storeBackgroundAsset({
      fileName: "serve.png",
      mimeType: "image/png",
      dataBase64: pngBytes.toString("base64"),
    })

    const headers: Record<string, string | number> = {}
    let ended!: () => void
    const done = new Promise<void>((resolve) => {
      ended = resolve
    })

    const response = {
      writeHead: (_status: number, hdrs?: Record<string, string>) => {
        Object.assign(headers, hdrs)
      },
      on: () => response,
      once: () => response,
      emit: () => true,
      write: () => true,
      end: () => {
        ended()
      },
    } as unknown as ServerResponse

    const request = {
      url: uploaded.url,
      method: "GET",
    } as IncomingMessage

    const handled = serveConfigAsset(request, response)
    expect(handled).toBe(true)
    expect(headers["X-Content-Type-Options"]).toBe("nosniff")
    expect(headers["Content-Type"]).toBe("image/png")
    await done
  })
})

describe("socket buffer sizing", () => {
  it("keeps the socket buffer at the default 1MB because uploads use HTTP", async () => {
    const { SOCKET_MAX_HTTP_BUFFER_SIZE, BACKGROUND_UPLOAD_MAX_BYTES } =
      await import("@razzia/socket/services/visuals")

    expect(SOCKET_MAX_HTTP_BUFFER_SIZE).toBe(1 * 1024 * 1024)
    expect(BACKGROUND_UPLOAD_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(SOCKET_MAX_HTTP_BUFFER_SIZE).toBeLessThan(BACKGROUND_UPLOAD_MAX_BYTES)
  })
})
