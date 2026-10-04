import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // `tsc --build` compiles src's tests into dist/ too; without this every
    // test would run twice, and a snapshot test's dist copy would compare
    // against an untracked dist/__snapshots__ file — absent on a fresh CI
    // checkout, where `--ci` refuses to write it.
    exclude: [...configDefaults.exclude, "dist/**"],
  },
});
