import { describe, expect, it } from "vitest"
import { fileURLToPath } from "node:url"
import { relative, resolve } from "node:path"
import { getConfigPath } from "@razzia/socket/services/config"

// The live game.json must never be reachable from a test by accident.
describe("vitest setup", () => {
  it("points every test at a throwaway config folder, not the project's", () => {
    const projectConfig = resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../../../config",
    )

    expect(process.env.CONFIG_PATH).toBeTruthy()

    const relation = relative(projectConfig, getConfigPath("game.json"))

    expect(relation.startsWith("..")).toBe(true)
  })
})
