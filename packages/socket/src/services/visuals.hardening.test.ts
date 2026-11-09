import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import type { IncomingMessage, ServerResponse } from "http"

const tempRoots: string[] = []
let configRoot = ""

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  configRoot = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-vis-hard-"))
  tempRoots.push(configRoot)
  process.env.CONFIG_PATH = configRoot
  fs.mkdirSync(path.join(configRoot, "assets/backgrounds"), { recursive: true })
  fs.mkdirSync(path.join(configRoot, "quizz"))
  fs.writeFileSync(
    path.join(configRoot, "game.json"),
    JSON.stringify({ managerPassword: "secret" }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.CONFIG_PATH
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])

const fakeResponse = () => {
  const state = { status: 0, body: "", destroyed: false }
  const response = {
    writeHead: (status: number) => {
      state.status = status
    },
    end: (payload?: string) => {
      state.body = payload ?? ""
    },
    on: () => response,
    once: () => response,
    emit: () => true,
    write: () => true,
    destroy: () => {
      state.destroyed = true
    },
  } as unknown as ServerResponse

  return { state, response }
}

describe("malformed request targets", () => {
  it.each(["//", "//a:b", "http://", "/\\"])(
    "answers 400 for %j without throwing",
    async (url) => {
      const { serveConfigAsset, serveBackgroundUpload } =
        await import("@razzia/socket/services/visuals")

      const asset = fakeResponse()
      expect(
        serveConfigAsset(
          { url, method: "GET" } as IncomingMessage,
          asset.response,
        ),
      ).toBe(true)
      expect(asset.state.status).toBe(400)

      const upload = fakeResponse()
      await expect(
        serveBackgroundUpload(
          { url, method: "POST", headers: {} } as unknown as IncomingMessage,
          upload.response,
          () => true,
        ),
      ).resolves.toBe(true)
      expect(upload.state.status).toBe(400)
    },
  )
})

describe("serveConfigAsset failures", () => {
  it("ends the response instead of crashing when the stream cannot open", async () => {
    const { storeBackgroundAsset, serveConfigAsset } =
      await import("@razzia/socket/services/visuals")
    const uploaded = storeBackgroundAsset("serve.png", pngBytes)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const { Readable } = await import("stream")
    const failing = new Readable({
      read() {
        this.destroy(new Error("ENOENT: gone"))
      },
    })
    vi.spyOn(fs, "createReadStream").mockReturnValue(
      failing as unknown as fs.ReadStream,
    )

    const { state, response } = fakeResponse()
    serveConfigAsset(
      { url: uploaded.url, method: "GET" } as IncomingMessage,
      response,
    )
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })

    expect(state.destroyed).toBe(true)
  })

  it("destroys the file stream when the client closes early", async () => {
    const { storeBackgroundAsset, serveConfigAsset } =
      await import("@razzia/socket/services/visuals")
    const uploaded = storeBackgroundAsset("serve.png", pngBytes)
    const stream = fs.createReadStream(
      path.join(configRoot, "assets/backgrounds", uploaded.ref.path),
    )
    vi.spyOn(fs, "createReadStream").mockReturnValue(stream)

    const closers: Array<() => void> = []
    const response = {
      writeHead: () => undefined,
      end: () => undefined,
      write: () => true,
      destroy: () => undefined,
      once: () => response,
      emit: () => true,
      on: (event: string, handler: () => void) => {
        if (event === "close") {
          closers.push(handler)
        }

        return response
      },
    } as unknown as ServerResponse

    serveConfigAsset(
      { url: uploaded.url, method: "GET" } as IncomingMessage,
      response,
    )
    for (const close of closers) {
      close()
    }

    expect(stream.destroyed).toBe(true)
  })
})

describe("upload errors", () => {
  it("does not echo a filesystem error to the client", async () => {
    const { serveBackgroundUpload } =
      await import("@razzia/socket/services/visuals")
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw new Error(
        "ENOSPC: no space left on device, open 'C:\\secret\\a.png'",
      )
    })

    const request = {
      url: "/config-assets/backgrounds",
      method: "POST",
      headers: { "x-client-id": "manager-1" },
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === "data") {
          handler(pngBytes)
        }

        if (event === "end") {
          handler()
        }

        return request
      },
      destroy: () => undefined,
    } as unknown as IncomingMessage
    const { state, response } = fakeResponse()

    await serveBackgroundUpload(request, response, () => true)

    expect(state.status).toBe(400)
    expect(state.body).not.toContain("secret")
    expect(JSON.parse(state.body)).toEqual({
      error: "errors:visuals.backgroundUploadFailed",
    })
  })
})
