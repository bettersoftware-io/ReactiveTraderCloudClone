import { defineConfig } from "vitest/config";

// Mirrors packages/ws-effects/vitest.config.ts's shape. `include` is scoped to
// plain `*.test.ts` files (src/visual/scenarios.test.ts and
// src/visual/holdMotion.test.ts, both pure-logic unit tests with no DOM/driver
// dependency — note the default `node` environment applies, so neither has a
// DOM at all) — this deliberately EXCLUDES
// src/specs/**/*.contract.spec.ts. Those specs need a jsdom environment, a
// registered UiContractDriver, and setupFiles that only exist in the consuming
// packages' own configs (packages/client-react/tests/ui/contract/vitest.config.ts,
// and a future client-solid twin); running them here with zero setup fails
// outright (verified empirically — every spec errored on the bare
// `@ui-contract/components` import with no alias/driver registered).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/specs/**"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
    },
  },
});
