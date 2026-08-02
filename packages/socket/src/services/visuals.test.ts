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
  configRoot = fs.mkdtempSync(path.join(os.tmpdir(), "razzia-visuals-"))
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
  vi.doUnmock("@razzia/socket/utils/game")
  delete process.env.CONFIG_PATH
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])

const quizzData = (
  subject: string,
  background?: { kind: "config-asset"; path: string },
) => ({
  subject,
  visuals: background ? { background } : undefined,
  questions: [
    {
      question: "Q1",
      answers: ["A", "B"],
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
  ],
})

describe("storeBackgroundAsset", () => {
  it("stores raw bytes after sniffing magic and builds a public url", async () => {
    const { storeBackgroundAsset, getBackgroundAssetPath } =
      await import("@razzia/socket/services/visuals")

    const uploaded = storeBackgroundAsset("room.png", pngBytes)

    expect(uploaded.ref.kind).toBe("config-asset")
    expect(uploaded.ref.path.endsWith(".png")).toBe(true)
    expect(uploaded.url).toContain("/config-assets/backgrounds/")
    expect(fs.existsSync(getBackgroundAssetPath(uploaded.ref.path) ?? "")).toBe(
      true,
    )
  })

  it("rejects non-image payloads", async () => {
    const { storeBackgroundAsset } =
      await import("@razzia/socket/services/visuals")

    expect(() =>
      storeBackgroundAsset("fake.png", Buffer.from("not-an-image")),
    ).toThrow("errors:visuals.unsupportedBackgroundType")
  })
})

describe("setGlobalBackground", () => {
  it("persists the ref and deletes the previous asset file", async () => {
    const {
      storeBackgroundAsset,
      setGlobalBackground,
      getBackgroundAssetPath,
    } = await import("@razzia/socket/services/visuals")
    const { getGameConfig } = await import("@razzia/socket/services/config")

    const first = storeBackgroundAsset("one.png", pngBytes)
    setGlobalBackground(first.ref)
    const firstPath = getBackgroundAssetPath(first.ref.path) ?? ""

    const second = storeBackgroundAsset("two.png", pngBytes)
    setGlobalBackground(second.ref)

    expect(getGameConfig().visuals?.background?.path).toBe(second.ref.path)
    expect(fs.existsSync(firstPath)).toBe(false)
    expect(fs.existsSync(getBackgroundAssetPath(second.ref.path) ?? "")).toBe(
      true,
    )
  })

  it("reclaims the prior asset when the global background is cleared", async () => {
    const {
      clearGlobalBackground,
      getBackgroundAssetPath,
      setGlobalBackground,
      storeBackgroundAsset,
    } = await import("@razzia/socket/services/visuals")
    const { getGameConfig } = await import("@razzia/socket/services/config")
    const uploaded = storeBackgroundAsset("clear.png", pngBytes)
    setGlobalBackground(uploaded.ref)

    clearGlobalBackground()

    expect(getGameConfig().visuals?.background).toBeUndefined()
    expect(fs.existsSync(getBackgroundAssetPath(uploaded.ref.path) ?? "")).toBe(
      false,
    )
  })
})

describe("background lifecycle", () => {
  it("reclaims quiz save-overwrite, update, clear, and delete backgrounds", async () => {
    vi.doMock("@razzia/socket/utils/game", () => ({
      normalizeFilename: () => "lifecycle-fixed",
    }))
    const {
      finalizeBackgroundMutation,
      getBackgroundAssetPath,
      storeBackgroundAsset,
    } = await import("@razzia/socket/services/visuals")
    const { deleteQuizz, saveQuizz, updateQuizz } =
      await import("@razzia/socket/services/config")

    const first = storeBackgroundAsset("first.png", pngBytes)
    const initial = saveQuizz(quizzData("Lifecycle", first.ref))
    finalizeBackgroundMutation(initial.previousBackground, initial.background)

    const second = storeBackgroundAsset("second.png", pngBytes)
    const overwrite = saveQuizz(quizzData("Lifecycle", second.ref))
    finalizeBackgroundMutation(
      overwrite.previousBackground,
      overwrite.background,
    )
    expect(fs.existsSync(getBackgroundAssetPath(first.ref.path) ?? "")).toBe(
      false,
    )

    const third = storeBackgroundAsset("third.png", pngBytes)
    const updated = updateQuizz(overwrite.id, quizzData("Lifecycle", third.ref))
    finalizeBackgroundMutation(updated.previousBackground, updated.background)
    expect(fs.existsSync(getBackgroundAssetPath(second.ref.path) ?? "")).toBe(
      false,
    )

    const cleared = updateQuizz(overwrite.id, quizzData("Lifecycle"))
    finalizeBackgroundMutation(cleared.previousBackground, cleared.background)
    expect(fs.existsSync(getBackgroundAssetPath(third.ref.path) ?? "")).toBe(
      false,
    )

    const fourth = storeBackgroundAsset("fourth.png", pngBytes)
    const restored = updateQuizz(
      overwrite.id,
      quizzData("Lifecycle", fourth.ref),
    )
    finalizeBackgroundMutation(restored.previousBackground, restored.background)
    const deleted = deleteQuizz(overwrite.id)
    finalizeBackgroundMutation(deleted.previousBackground)
    expect(fs.existsSync(getBackgroundAssetPath(fourth.ref.path) ?? "")).toBe(
      false,
    )
  })

  it("retains an asset while another persisted config references it", async () => {
    const {
      finalizeBackgroundMutation,
      getBackgroundAssetPath,
      setGlobalBackground,
      storeBackgroundAsset,
    } = await import("@razzia/socket/services/visuals")
    const { saveQuizz, updateQuizz } =
      await import("@razzia/socket/services/config")
    const shared = storeBackgroundAsset("shared.png", pngBytes)
    setGlobalBackground(shared.ref)
    const saved = saveQuizz(quizzData("Shared", shared.ref))
    finalizeBackgroundMutation(saved.previousBackground, saved.background)

    const cleared = updateQuizz(saved.id, quizzData("Shared"))
    finalizeBackgroundMutation(cleared.previousBackground, cleared.background)

    expect(fs.existsSync(getBackgroundAssetPath(shared.ref.path) ?? "")).toBe(
      true,
    )
  })

  it("fails closed before deletion when persisted config is malformed", async () => {
    const { getBackgroundAssetPath, reclaimBackgroundAssets } =
      await import("@razzia/socket/services/visuals")
    const orphan = "orphan.png"
    const orphanPath = getBackgroundAssetPath(orphan) ?? ""
    fs.writeFileSync(orphanPath, pngBytes)
    fs.writeFileSync(path.join(configRoot, "quizz/broken.json"), "{")

    expect(() =>
      reclaimBackgroundAssets({ candidates: [orphan], minimumAgeMs: 0 }),
    ).toThrow()
    expect(fs.existsSync(orphanPath)).toBe(true)
  })

  it("keeps a committed clear successful when unlink fails", async () => {
    const {
      clearGlobalBackground,
      getBackgroundAssetPath,
      setGlobalBackground,
      storeBackgroundAsset,
    } = await import("@razzia/socket/services/visuals")
    const { getGameConfig } = await import("@razzia/socket/services/config")
    const uploaded = storeBackgroundAsset("unlink.png", pngBytes)
    setGlobalBackground(uploaded.ref)
    const uploadedPath = getBackgroundAssetPath(uploaded.ref.path) ?? ""
    const realUnlink = fs.unlinkSync.bind(fs)
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    vi.spyOn(fs, "unlinkSync").mockImplementation((target) => {
      if (String(target) === uploadedPath) {
        throw new Error("locked")
      }

      return realUnlink(target)
    })

    expect(() => clearGlobalBackground()).not.toThrow()
    expect(getGameConfig().visuals?.background).toBeUndefined()
    expect(fs.existsSync(uploadedPath)).toBe(true)
    expect(warning).toHaveBeenCalled()
  })

  it("honors runtime age grace while deleting aged non-pending orphans", async () => {
    const { getBackgroundAssetPath, sweepBackgroundAssets } =
      await import("@razzia/socket/services/visuals")
    const freshPath = getBackgroundAssetPath("fresh.png") ?? ""
    const agedPath = getBackgroundAssetPath("aged.png") ?? ""
    fs.writeFileSync(freshPath, pngBytes)
    fs.writeFileSync(agedPath, pngBytes)
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
    fs.utimesSync(agedPath, old, old)

    sweepBackgroundAssets()

    expect(fs.existsSync(freshPath)).toBe(true)
    expect(fs.existsSync(agedPath)).toBe(false)
  })

  it("preserves every current-process pending upload even after grace", async () => {
    const {
      getBackgroundAssetPath,
      storeBackgroundAsset,
      sweepBackgroundAssets,
    } = await import("@razzia/socket/services/visuals")
    const uploaded = storeBackgroundAsset("pending.png", pngBytes)
    const uploadedPath = getBackgroundAssetPath(uploaded.ref.path) ?? ""
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
    fs.utimesSync(uploadedPath, old, old)

    sweepBackgroundAssets()

    expect(fs.existsSync(uploadedPath)).toBe(true)
  })

  it("uses zero grace at startup to reclaim an abandoned upload", async () => {
    const orphanPath = path.join(configRoot, "assets/backgrounds/abandoned.png")
    fs.writeFileSync(orphanPath, pngBytes)
    vi.resetModules()
    const { cleanupBackgroundAssetsOnStartup } =
      await import("@razzia/socket/services/visuals")

    cleanupBackgroundAssetsOnStartup()

    expect(fs.existsSync(orphanPath)).toBe(false)
  })

  it("rejects symlinks as managed deletion candidates", async ({ skip }) => {
    const outside = path.join(configRoot, "outside.png")
    const linked = path.join(configRoot, "assets/backgrounds/linked.png")
    fs.writeFileSync(outside, pngBytes)

    try {
      fs.symlinkSync(outside, linked, "file")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        skip()

        return
      }

      throw error
    }

    const { reclaimBackgroundAssets } =
      await import("@razzia/socket/services/visuals")

    const result = reclaimBackgroundAssets({
      candidates: ["linked.png"],
      minimumAgeMs: 0,
    })

    expect(result).toEqual({ examined: 1, deleted: 0, retained: 1 })
    expect(fs.existsSync(linked)).toBe(true)
    expect(fs.existsSync(outside)).toBe(true)
  })

  it("commits configuration before exact reclamation without yielding", async () => {
    const {
      clearGlobalBackground,
      getBackgroundAssetPath,
      setGlobalBackground,
      storeBackgroundAsset,
    } = await import("@razzia/socket/services/visuals")
    const uploaded = storeBackgroundAsset("ordered.png", pngBytes)
    setGlobalBackground(uploaded.ref)
    const uploadedPath = getBackgroundAssetPath(uploaded.ref.path) ?? ""
    const writeSpy = vi.spyOn(fs, "writeFileSync")
    const unlinkSpy = vi.spyOn(fs, "unlinkSync")

    const result = clearGlobalBackground()

    expect(result).not.toBeInstanceOf(Promise)
    expect(String(unlinkSpy.mock.calls[0]?.[0])).toBe(uploadedPath)
    expect(writeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      unlinkSpy.mock.invocationCallOrder[0],
    )
  })
})

describe("serveConfigAsset", () => {
  it("sets X-Content-Type-Options: nosniff", async () => {
    const { storeBackgroundAsset, serveConfigAsset } =
      await import("@razzia/socket/services/visuals")
    const uploaded = storeBackgroundAsset("serve.png", pngBytes)

    const headers: Record<string, string | number> = {}
    let ended: () => void = () => undefined
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
    const { serveBackgroundUpload } =
      await import("@razzia/socket/services/visuals")
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
