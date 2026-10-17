import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

// @testing-library/jest-dom is a devDependency even though no test here calls
// its matchers directly: vite-plugin-solid auto-injects a jest-dom vitest
// setup file, and pnpm's strict linking fails at install time if the package
// isn't an explicit dependency of this workspace.
export default defineConfig({
  plugins: [solid()],
  test: {
    // One VM context per test file, modules loaded once: ~3x less CPU than
    // re-importing jsdom and every module per file. See
    // docs/architecture/09-test-strategy.md §"The test pool".
    pool: "vmThreads",
    environment: "jsdom",
    globals: true,
    exclude: ["dist/**", "node_modules/**"],
  },
});
