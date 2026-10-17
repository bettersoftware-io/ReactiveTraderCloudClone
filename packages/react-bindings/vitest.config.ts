import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One VM context per test file, modules loaded once: ~3x less CPU than
    // re-importing jsdom and every module per file. See
    // docs/architecture/09-test-strategy.md §"The test pool".
    pool: "vmThreads",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup/jsdom-storage.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
