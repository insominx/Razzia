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
  fs.writeFileSync(
    path.join(root, "game.json"),
    JSON.stringify({ managerPassword: "secret" }),
  )
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
  it("stores raw bytes after sniffing magic and builds a public url", async () => {
    const { storeBackgroundAsset, getBackgroundAssetPath } = await import(
      "@razzia/socket/services/visuals"
    )

    const uploaded = storeBackgroundAsset("room.png", pngBytes)

    expect(uploaded.ref.kind).toBe("config-asset")
    expect(uploaded.ref.path.endsWith(".png")).toBe(true)
    expect(uploaded.url).toContain("/config-assets/backgrounds/")
    expect(fs.existsSync(getBackgroundAssetPath(uploaded.ref.path)!)).toBe(true)
  })

  it("rejects non-image payloads", async () => {
    const { storeBackgroundAsset } = await import(
      "@razzia/socket/services/visuals"
    )

    expect(() =>
      storeBackgroundAsset("fake.png", Buffer.from("not-an-image")),
    ).toThrow("errors:visuals.unsupportedBackgroundType")
  })
})

describe("setGlobalBackground", () => {
  it("persists the ref and deletes the previous asset file", async () => {
    const { storeBackgroundAsset, setGlobalBackground, getBackgroundAssetPath } =
      await import("@razzia/socket/services/visuals")
    const { getGameConfig } = await import("@razzia/socket/services/config")

    const first = storeBackgroundAsset("one.png", pngBytes)
    setGlobalBackground(first.ref)
    const firstPath = getBackgroundAssetPath(first.ref.path)!

    const second = storeBackgroundAsset("two.png", pngBytes)
    setGlobalBackground(second.ref)

    expect(getGameConfig().visuals?.background?.path).toBe(second.ref.path)
    expect(fs.existsSync(firstPath)).toBe(false)
    expect(fs.existsSync(getBackgroundAssetPath(second.ref.path)!)).toBe(true)
  })
})

describe("serveConfigAsset", () => {
  it("sets X-Content-Type-Options: nosniff", async () => {
    const { storeBackgroundAsset, serveConfigAsset } = await import(
      "@razzia/socket/services/visuals"
    )
    const uploaded = storeBackgroundAsset("serve.png", pngBytes)

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

    const handled = serveConfigAsset(
      { url: uploaded.url, method: "GET" } as IncomingMessage,
      response,
    )
    expect(handled).toBe(true)
    expect(headers["X-Content-Type-Options"]).toBe("nosniff")
    expect(headers["Content-Type"]).toBe("image/png")
    await done
  })
})

describe("serveBackgroundUpload", () => {
  it("stores only by default and can set global via query", async () => {
    const { serveBackgroundUpload } = await import(
      "@razzia/socket/services/visuals"
    )
    const { getGameConfig } = await import("@razzia/socket/services/config")

    const runUpload = async (urlPath: string) => {
      let body = ""
      const chunks = [pngBytes]
      const request = {
        url: urlPath,
        method: "POST",
        headers: {
          "x-client-id": "manager-1",
          "x-file-name": "global.png",
        },
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (event === "data") {
            for (const chunk of chunks) {
              handler(chunk)
            }
          }
          if (event === "end") {
            handler()
          }
          return request
        },
        destroy: () => undefined,
      } as unknown as IncomingMessage

      const response = {
        writeHead: () => undefined,
        end: (payload?: string) => {
          body = payload ?? ""
        },
      } as unknown as ServerResponse

      const handled = await serveBackgroundUpload(
        request,
        response,
        (clientId) => clientId === "manager-1",
      )
      expect(handled).toBe(true)
      return JSON.parse(body) as { ref: { path: string }; url: string }
    }

    const assetOnly = await runUpload("/config-assets/backgrounds")
    expect(assetOnly.url).toContain("/config-assets/backgrounds/")
    expect(getGameConfig().visuals?.background).toBeUndefined()

    const withGlobal = await runUpload("/config-assets/backgrounds?setGlobal=1")
    expect(getGameConfig().visuals?.background?.path).toBe(withGlobal.ref.path)
  })
})
