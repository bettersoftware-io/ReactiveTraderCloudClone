import { defineConfig, mergeConfig } from "vitest/config";

import base from "./vitest.config";

// Report-only v8 coverage for the app tier (src/app: browser adapters + the
// port composition seam) — the Solid mirror of client-react's
// vitest.app.coverage.config.ts, so the published coverage report can show both
// clients side by side instead of react only.
//
// These tests already RAN under `pnpm test`; what was missing was a coverage
// DENOMINATOR scoped to src/app. That blind spot is not theoretical: it hid
// buildBrowserPorts.ts sitting at 50% (the whole ws-real branch untested) —
// the exact gap its react twin had, found only once this config existed.
//
// No `src/app/composition.ts` exclude here (unlike react): this package has no
// such file, and excluding a non-existent path would be misleading rather than
// harmless.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      outputFile: { html: "reports/app/report/index.html" },
      coverage: {
        provider: "v8",
        // Count every src/app file so untested adapters surface at 0%.
        include: ["src/app/**"],
        exclude: [
          // Vitest auto-excludes the *executed* test files, but NOT non-spec
          // test-support modules (fakes, helpers). vitest v4's
          // coverageConfigDefaults.exclude is empty, so the broad src/app/**
          // include would otherwise count them as production source.
          "**/__tests__/**",
          "**/*.testHelpers.ts",
        ],
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "reports/app/coverage",
      },
    },
  }),
);
