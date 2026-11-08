import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Testing Library only unmounts what a test rendered by itself when the test
// runner has a global afterEach, and this config has no globals. Without this,
// a tree left by one test keeps its effects and store subscriptions live.
afterEach(() => {
  cleanup()
})
