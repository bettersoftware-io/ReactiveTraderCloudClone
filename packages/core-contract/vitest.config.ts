import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One VM context per test file, modules loaded once: ~3x less CPU than
    // re-importing jsdom and every module per file. See
    // docs/architecture/09-test-strategy.md §"The test pool".
    pool: "vmThreads",
    environment: "node",
    // Only this package's OWN tests — the registry drift test. The suites
    // under src/suites/ are exported spec functions: they run inside each
    // core's runner file (packages/<core>/src/composition.coreContract.test.ts),
    // never here.
    include: ["src/**/*.test.ts"],
  },
});
