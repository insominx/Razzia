import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { howler } = vi.hoisted(() => ({
  howler: {
    ctx: null as { resume: () => Promise<void> } | null,
    volume: vi.fn(),
    mute: vi.fn(),
  },
}))

vi.mock("howler", () => ({ Howler: howler }))

const stubStorage = () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
    removeItem: (key: string) => {
      entries.delete(key)
    },
    clear: () => {
      entries.clear()
    },
  }

  vi.stubGlobal("localStorage", storage)

  return storage
}

const importStore = async () =>
  (await import("@razzia/web/features/game/stores/sound")).useSoundStore

describe("useSoundStore suppression for a hidden lecture page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("mutes Howler without touching the saved preference", async () => {
    const storage = stubStorage()
    const useSoundStore = await importStore()
    useSoundStore.getState().bindSurface("manager")
    howler.mute.mockClear()

    useSoundStore.getState().setSuppressed(true)

    expect(howler.mute).toHaveBeenLastCalledWith(true)
    expect(useSoundStore.getState()).toMatchObject({
      muted: false,
      suppressed: true,
    })
    expect(storage.getItem("sound_muted_manager")).toBeNull()

    useSoundStore.getState().setSuppressed(false)

    expect(howler.mute).toHaveBeenLastCalledWith(false)
  })

  it("stays silent while suppressed, whatever the controls do", async () => {
    stubStorage()
    const useSoundStore = await importStore()
    useSoundStore.getState().setSuppressed(true)

    useSoundStore.getState().bindSurface("manager")
    expect(howler.mute).toHaveBeenLastCalledWith(true)

    useSoundStore.getState().setVolume(0.5)
    expect(howler.mute).toHaveBeenLastCalledWith(true)

    useSoundStore.getState().toggleMute()
    useSoundStore.getState().toggleMute()
    expect(howler.mute).toHaveBeenLastCalledWith(true)
  })

  it("keeps the host's own mute when the page shows again", async () => {
    stubStorage()
    const useSoundStore = await importStore()
    useSoundStore.getState().bindSurface("manager")
    useSoundStore.getState().toggleMute()

    useSoundStore.getState().setSuppressed(true)
    useSoundStore.getState().setSuppressed(false)

    expect(howler.mute).toHaveBeenLastCalledWith(true)
  })
})
