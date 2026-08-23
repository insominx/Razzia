import { Howler } from "howler"
import { create } from "zustand"

const VOLUME_KEY = "sound_volume"
const MUTED_KEY = "sound_muted"

export const DEFAULT_VOLUME = 1

const clamp = (volume: number): number => Math.min(1, Math.max(0, volume))

const getStoredVolume = (): number => {
  try {
    const stored = localStorage.getItem(VOLUME_KEY)

    if (stored === null) {
      return DEFAULT_VOLUME
    }

    const parsed = Number(stored)

    return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

const getStoredMuted = (): boolean => {
  try {
    return localStorage.getItem(MUTED_KEY) === "true"
  } catch {
    return false
  }
}

const persist = (volume: number, muted: boolean) => {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume))
    localStorage.setItem(MUTED_KEY, String(muted))
  } catch {
    // Private browsing can refuse writes; the level still applies this session.
  }
}

/**
 * Pushes the preference onto Howler's master gain, which multiplies the
 * per-cue volumes in `SFX` rather than replacing them.
 *
 * `mute` is written before `volume`, and `volume` on every mutation rather
 * than only when it changes. Howler's `volume()` returns before touching any
 * node while muted, and its `mute(false)` only flips each HTML5 node's native
 * `.muted` flag without re-reading `_volume` — so on the HTML5-Audio fallback
 * path, muting, moving the slider, then unmuting would play back at the
 * pre-mute level. The trailing `volume()` closes that; under Web Audio it is a
 * harmless repeat `setValueAtTime`.
 */
const applyToHowler = (volume: number, muted: boolean) => {
  Howler.mute(muted)
  Howler.volume(volume)
}

interface SoundStore {
  volume: number
  muted: boolean

  setVolume: (_volume: number) => void
  toggleMute: () => void
  unlock: () => void
}

const initialVolume = getStoredVolume()
const initialMuted = getStoredMuted()

// Applied at module scope, not from an effect. `main.tsx` imports this module
// for the side effect so the stored level reaches Howler before the first Howl
// is constructed, on every route — including `/dev/gallery`, which renders the
// sound-playing states without `GameWrapper` and so never mounts VolumeControl.
//
// Known limitation, accepted: two tabs of the same origin diverge until reload.
// `setItem` fires no `storage` event in the writing tab and nothing listens in
// the others. The preference is per-device by design.
applyToHowler(initialVolume, initialMuted)

export const useSoundStore = create<SoundStore>((set, get) => ({
  volume: initialVolume,
  muted: initialMuted,

  // Any slider movement also unmutes: adjusting a muted slider would otherwise
  // move the thumb and stay silent, which reads as a broken control.
  setVolume: (volume) => {
    const clamped = clamp(volume)

    persist(clamped, false)
    applyToHowler(clamped, false)
    set({ volume: clamped, muted: false })
  },

  // Unmuting a slider sitting at zero restores the default, so the toggle is
  // never a no-op that looks broken.
  toggleMute: () => {
    const { volume, muted } = get()
    const nextMuted = !muted
    const nextVolume = !nextMuted && volume === 0 ? DEFAULT_VOLUME : volume

    persist(nextVolume, nextMuted)
    applyToHowler(nextVolume, nextMuted)
    set({ volume: nextVolume, muted: nextMuted })
  },

  // `@types/howler` declares `ctx` as always present, but howler only assigns
  // it when Web Audio is available -- it stays null wherever howler fell back
  // to HTML5 Audio, so the guard is real and the lint rule is working from a
  // wrong type.
  unlock: () => {
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    void Howler.ctx?.resume()
  },
}))
