import react from "@vitejs/plugin-react"
import { fileURLToPath } from "url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify("test"),
  },
  resolve: {
    alias: {
      "@razzia/web": fileURLToPath(new URL("./src", import.meta.url)),
      "@razzia/common": fileURLToPath(
        new URL("../common/src", import.meta.url),
      ),
      "@razzia/socket": fileURLToPath(
        new URL("../socket/src", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
    // A test that imports a game screen pulls in the whole score behind it
    // (engine, scenes, both legacy packs), which takes seconds on a busy
    // machine; the default five would make those tests flaky, not fast.
    testTimeout: 20_000,
  },
})
