import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One VM context per test file, modules loaded once: ~3x less CPU than
    // re-importing jsdom and every module per file. See
    // docs/architecture/09-test-strategy.md §"The test pool".
    pool: "vmThreads",
    environment: "node",
    globals: true,
    // `tsc --build` compiles src's tests into dist/ too; without this every
    // test would run twice, and a snapshot test's dist copy would compare
    // against an untracked dist/__snapshots__ file — absent on a fresh CI
    // checkout, where `--ci` refuses to write it.
    exclude: [...configDefaults.exclude, "dist/**"],
  },
});
