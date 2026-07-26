import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      // `src/adapters/__tests__/` holds test SCAFFOLDING — FakeWsAdapter and
      // awaitPendingRpc — not production code. Left in the denominator they
      // read as coverage gaps (82.9% and 71.4%) that no sensible test closes:
      // you would be testing the fake rather than the thing it fakes.
      //
      // Spread the defaults rather than replacing them: vitest's `exclude` is a
      // full override, so a bare array would silently pull node_modules, dist
      // and config files back into the report.
      exclude: [...coverageConfigDefaults.exclude, "**/__tests__/**"],
    },
  },
});
