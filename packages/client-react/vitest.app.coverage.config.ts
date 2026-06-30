import { defineConfig, mergeConfig } from "vitest/config";

import base from "./vitest.config";

// Report-only v8 coverage for the app tier (src/app: presenters + WS adapters).
// Reuses the base jsdom/react config; the `src/app` positional in the script
// scopes which tests RUN, coverage.include scopes the DENOMINATOR. The test
// HTML report is redirected to reports/app so it doesn't clobber reports/unit.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      outputFile: { html: "reports/app/report/index.html" },
      coverage: {
        provider: "v8",
        // Count every src/app file so untested presenters/adapters surface at 0%.
        include: ["src/app/**"],
        exclude: [
          // Vitest auto-excludes the *executed* test files (*.test.ts), but NOT
          // non-spec test-support modules (the __tests__/ FakeWsAdapter double +
          // awaitPendingRpc helper). vitest v4's coverageConfigDefaults.exclude is
          // empty, so the broad src/app/** include would otherwise count them as
          // production source. Exclude the whole __tests__/ convention explicitly.
          "**/__tests__/**",
          // Composition root: import.meta.env detection + `new X()` port/presenter
          // wiring + DOM bootstrap; not unit-testable without a production refactor.
          // Covered by tests/fullstack + UI smokes. Mirrors the server's
          // src/index.ts / serviceContainer.ts coverage exclude.
          "src/app/composition.ts",
          "**/*.testHelpers.ts", // extracted test doubles, not production source
        ],
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "reports/app/coverage",
      },
    },
  }),
);
