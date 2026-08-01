import { defineConfig } from "vitest/config"
import { fileURLToPath } from "url"

export default defineConfig({
  resolve: {
    alias: {
      "@razzia/common": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
