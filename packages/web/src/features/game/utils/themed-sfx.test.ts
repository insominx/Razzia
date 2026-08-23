import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  SFX,
  THEMED_SFX_FILES,
} from "@razzia/web/features/game/utils/constants"

// Vitest roots at `packages/web`, so the shipped assets sit under `public/`.
const themesDir = resolve(process.cwd(), "public/sounds/themes")

const CLASSIC_BASENAMES = [
  SFX.ANSWERS.MUSIC,
  SFX.ANSWERS.SOUND,
  SFX.BOUMP_SOUND,
  SFX.SHOW_SOUND,
  SFX.RESULTS_SOUND,
  SFX.PODIUM.THREE,
  SFX.PODIUM.SECOND,
  SFX.PODIUM.SNEAR_ROOL,
  SFX.PODIUM.FIRST,
].map((path) => path.slice(path.lastIndexOf("/") + 1))

describe("themed sound packs", () => {
  // The guard is declared ⊆ on-disk: a cue a pack declares but does
  // not ship would 404 into silence at play time. The reverse is allowed —
  // spare or audition files may sit in a pack directory; nothing references
  // them.
  it.each(Object.entries(THEMED_SFX_FILES))(
    "%s ships every file it declares",
    (theme, declared) => {
      const onDisk = readdirSync(resolve(themesDir, theme)).filter((file) =>
        file.endsWith(".mp3"),
      )

      expect(onDisk.sort()).toEqual(
        expect.arrayContaining([...declared].sort()),
      )
    },
  )

  it("declares techno cues that all map onto classic cues", () => {
    expect([...(THEMED_SFX_FILES.techno ?? [])].sort()).toEqual(
      [...CLASSIC_BASENAMES].sort(),
    )
  })
})
