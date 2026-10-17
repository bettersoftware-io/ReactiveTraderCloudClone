import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

// The tests ran off vite.config.ts alone until 2026-10-17; this file exists so
// the package can declare its test pool like every other one (grep gate 54).
// Merged over the vite config, so the plugins the tests ran under before are
// unchanged.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // One VM context per test file, modules loaded once: ~3x less CPU than
      // re-importing jsdom and every module per file. See
      // docs/architecture/09-test-strategy.md §"The test pool".
      pool: "vmThreads",
    },
  }),
);
