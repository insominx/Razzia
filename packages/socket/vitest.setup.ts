import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeEach } from "vitest"

// Without CONFIG_PATH the config folder is "../../config" from the working
// directory, which from here is the real one: a test that forgot to set it
// would read, and could create or change, the live game.json. Every test file
// starts with a throwaway folder instead; tests that want their own set it.
const fallbackRoot = mkdtempSync(join(tmpdir(), "razzia-test-config-"))

const ensureConfigPath = () => {
  process.env.CONFIG_PATH ??= fallbackRoot
}

ensureConfigPath()
beforeEach(ensureConfigPath)
afterAll(() => {
  rmSync(fallbackRoot, { recursive: true, force: true })
})
