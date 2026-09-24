import {
  SFX,
  sfxForTheme,
  sfxVolume,
  THEMED_SFX_FILES,
  THEMED_SFX_TRIM_DB,
} from "@razzia/web/features/game/utils/constants"
import { describe, expect, it } from "vitest"

const CLASSIC_CUES = [
  SFX.ANSWERS.MUSIC,
  SFX.ANSWERS.SOUND,
  SFX.BOUMP_SOUND,
  SFX.SHOW_SOUND,
  SFX.RESULTS_SOUND,
  SFX.PODIUM.THREE,
  SFX.PODIUM.SECOND,
  SFX.PODIUM.SNEAR_ROOL,
  SFX.PODIUM.FIRST,
]

// The classic mix as it shipped before the table existed; levelling other
// packs must never move it.
const CLASSIC_MIX = {
  [SFX.ANSWERS.MUSIC]: 0.2,
  [SFX.ANSWERS.SOUND]: 0.1,
  [SFX.BOUMP_SOUND]: 0.2,
  [SFX.SHOW_SOUND]: 0.5,
  [SFX.RESULTS_SOUND]: 0.2,
  [SFX.PODIUM.THREE]: 0.1,
  [SFX.PODIUM.SECOND]: 0.1,
  [SFX.PODIUM.SNEAR_ROOL]: 0.1,
  [SFX.PODIUM.FIRST]: 0.1,
}

describe("sfxVolume", () => {
  it("keeps the classic mix exactly", () => {
    for (const cue of CLASSIC_CUES) {
      expect(sfxVolume(cue)).toBe(CLASSIC_MIX[cue])
    }
  })

  it("applies the pack trim to themed paths and stays within Howler's range", () => {
    for (const cue of CLASSIC_CUES) {
      const themed = sfxForTheme("techno", cue)
      const basename = themed.slice(themed.lastIndexOf("/") + 1)
      const trim = THEMED_SFX_TRIM_DB.techno?.[basename] ?? 0
      const volume = sfxVolume(themed)

      expect(volume).toBeCloseTo(CLASSIC_MIX[cue] * 10 ** (trim / 20), 6)
      expect(volume).toBeGreaterThan(0)
      expect(volume).toBeLessThanOrEqual(1)
    }
  })

  it("plays the techno fanfare over its countdown tick, as classic does", () => {
    // Max momentary loudness (LUFS) of the shipped files, from ffmpeg
    // `ebur128`. Heard level = file loudness + gain in dB.
    const measured = {
      classic: { tick: -15.7, fanfare: -4.3 },
      techno: { tick: -12.0, fanfare: -14.2 },
    }
    const heard = (lufs: number, volume: number) =>
      lufs + 20 * Math.log10(volume)

    const classicTick = heard(measured.classic.tick, sfxVolume(SFX.BOUMP_SOUND))
    const classicFanfare = heard(
      measured.classic.fanfare,
      sfxVolume(SFX.PODIUM.FIRST),
    )
    const technoTick = heard(
      measured.techno.tick,
      sfxVolume(sfxForTheme("techno", SFX.BOUMP_SOUND)),
    )
    const technoFanfare = heard(
      measured.techno.fanfare,
      sfxVolume(sfxForTheme("techno", SFX.PODIUM.FIRST)),
    )

    expect(technoFanfare).toBeGreaterThan(technoTick)
    expect(technoFanfare).toBeCloseTo(classicFanfare, 1)
    expect(technoTick).toBeCloseTo(classicTick, 1)
  })

  it("only trims cues a pack actually ships", () => {
    for (const [theme, trims] of Object.entries(THEMED_SFX_TRIM_DB)) {
      const shipped = THEMED_SFX_FILES[theme as keyof typeof THEMED_SFX_FILES]

      expect(shipped).toBeDefined()
      expect(Object.keys(trims).sort()).toEqual([...(shipped ?? [])].sort())
    }
  })

  it("falls back to the classic gain for an unknown pack directory", () => {
    expect(sfxVolume("/sounds/themes/unknown/results.mp3")).toBe(0.2)
  })
})
