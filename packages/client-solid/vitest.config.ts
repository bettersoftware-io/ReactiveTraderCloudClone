import { fileURLToPath } from "node:url";

import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

// @testing-library/jest-dom is a devDependency even though no test here calls
// its matchers directly: vite-plugin-solid auto-injects a jest-dom vitest
// setup file, and pnpm's strict linking fails at install time if the package
// isn't an explicit dependency of this workspace (see solid-bindings'
// vitest.config.ts for the full explanation).
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      // The shared scenario/goldenPath matrix (@rtc/ui-contract) —
      // resolveScenarioData.test.ts imports the Scenario/AppData types from
      // it. Mirrors client-react's root vitest.config.ts alias.
      "@ui-visual-shared": fileURLToPath(
        new URL("../ui-contract/src/visual", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    // @solidjs/testing-library's `render()` only auto-registers its
    // afterEach(cleanup) when a global `afterEach` exists at import time
    // (see its dist/index.js) — matches solid-bindings' vitest.config.ts, so
    // multiple `render()` calls across `it`s in one file don't leak DOM
    // between tests (a `pending-panel`/`header` double-render collision is
    // exactly what an unregistered cleanup produces).
    globals: true,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/parity/**/*.test.ts",
      "tests/ui/visual/**/*.test.ts",
      "tests/ui/visual/**/*.test.tsx",
    ],
    // Node 26 ships a native (experimental, flag-gated) localStorage/
    // sessionStorage accessor pair that shadows jsdom's own Storage inside
    // vitest — see the shim's header comment for the full story.
    setupFiles: ["./tests/setup/jsdom-storage.ts"],
    passWithNoTests: true,
  },
});
