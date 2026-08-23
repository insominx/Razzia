import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { howler } = vi.hoisted(() => ({
  howler: {
    ctx: null as { resume: () => Promise<void> } | null,
    volume: vi.fn(),
    mute: vi.fn(),
  },
}))

vi.mock("howler", () => ({ Howler: howler }))

// This jsdom setup does not expose localStorage, so the store's own try/catch
// is what keeps it working there. Tests that care about persistence install a
// Map-backed stand-in.
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

describe("useSoundStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    howler.ctx = { resume: vi.fn().mockResolvedValue(undefined) }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("applies the stored preference to Howler at import time", async () => {
    const storage = stubStorage()
    storage.setItem("sound_volume", "0.4")
    storage.setItem("sound_muted", "true")

    const useSoundStore = await importStore()

    expect(howler.mute).toHaveBeenCalledWith(true)
    expect(howler.volume).toHaveBeenCalledWith(0.4)
    expect(useSoundStore.getState()).toMatchObject({ volume: 0.4, muted: true })
  })

  it("falls back to full volume, unmuted, with nothing stored", async () => {
    stubStorage()

    const useSoundStore = await importStore()

    expect(useSoundStore.getState()).toMatchObject({ volume: 1, muted: false })
  })

  it.each([
    ["out of range", "5", 1],
    ["negative", "-2", 0],
    ["not a number", "loud", 1],
  ])("clamps a stored volume that is %s", async (_label, stored, expected) => {
    stubStorage().setItem("sound_volume", stored)

    const useSoundStore = await importStore()

    expect(useSoundStore.getState().volume).toBe(expected)
  })

  it("falls back when storage is unavailable", async () => {
    // No stub: reading `localStorage` throws a ReferenceError under jsdom,
    // which is the same path a browser in private mode takes.
    const useSoundStore = await importStore()

    expect(useSoundStore.getState()).toMatchObject({ volume: 1, muted: false })
    expect(howler.volume).toHaveBeenCalledWith(1)
  })

  it("keeps working when storage refuses writes", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied")
      },
    })

    const useSoundStore = await importStore()

    expect(() => useSoundStore.getState().setVolume(0.5)).not.toThrow()
    expect(useSoundStore.getState().volume).toBe(0.5)
    expect(howler.volume).toHaveBeenLastCalledWith(0.5)
  })

  it("setVolume persists, applies, and clears mute", async () => {
    const storage = stubStorage()
    storage.setItem("sound_muted", "true")

    const useSoundStore = await importStore()
    useSoundStore.getState().setVolume(0.7)

    expect(useSoundStore.getState()).toMatchObject({
      volume: 0.7,
      muted: false,
    })
    expect(storage.getItem("sound_volume")).toBe("0.7")
    expect(storage.getItem("sound_muted")).toBe("false")
    expect(howler.mute).toHaveBeenLastCalledWith(false)
    expect(howler.volume).toHaveBeenLastCalledWith(0.7)
  })

  it("toggleMute restores the default when unmuting a zeroed slider", async () => {
    stubStorage()

    const useSoundStore = await importStore()

    useSoundStore.getState().setVolume(0)
    useSoundStore.getState().toggleMute()
    expect(useSoundStore.getState()).toMatchObject({ volume: 0, muted: true })

    useSoundStore.getState().toggleMute()
    expect(useSoundStore.getState()).toMatchObject({ volume: 1, muted: false })
  })

  it("keeps the level when unmuting a non-zero slider", async () => {
    stubStorage()

    const useSoundStore = await importStore()

    useSoundStore.getState().setVolume(0.3)
    useSoundStore.getState().toggleMute()
    useSoundStore.getState().toggleMute()

    expect(useSoundStore.getState()).toMatchObject({
      volume: 0.3,
      muted: false,
    })
  })

  // Guards the HTML5-Audio fallback: mute(false) never re-reads _volume, so the
  // trailing volume() is what stops a post-unmute cue playing at the old level.
  it("always writes volume after mute", async () => {
    stubStorage()

    const useSoundStore = await importStore()

    vi.clearAllMocks()
    useSoundStore.getState().toggleMute()

    expect(howler.mute).toHaveBeenCalledTimes(1)
    expect(howler.volume).toHaveBeenCalledTimes(1)
    expect(howler.mute.mock.invocationCallOrder[0]).toBeLessThan(
      howler.volume.mock.invocationCallOrder[0],
    )
  })

  it("unlock resumes the audio context", async () => {
    const useSoundStore = await importStore()

    useSoundStore.getState().unlock()

    expect(howler.ctx?.resume).toHaveBeenCalled()
  })

  it("unlock is a no-op when there is no audio context", async () => {
    howler.ctx = null

    const useSoundStore = await importStore()

    expect(() => useSoundStore.getState().unlock()).not.toThrow()
  })
})
