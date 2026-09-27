import {
  configDefaults,
  coverageConfigDefaults,
  defineConfig,
} from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // `tsc --build` compiles src's tests into dist/ too, and without this the
    // run picked them up there as well: every test ran twice, and a snapshot
    // test's dist copy (publicApi.test.js, slice 8) compared against an
    // untracked dist/__snapshots__ file — stale locally, absent on a fresh CI
    // checkout, where `--ci` refuses to write it.
    exclude: [...configDefaults.exclude, "dist/**"],
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
