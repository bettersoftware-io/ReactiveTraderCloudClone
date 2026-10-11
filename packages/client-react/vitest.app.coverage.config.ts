import { defineConfig, mergeConfig } from "vitest/config";

import base from "./vitest.config";

// Report-only v8 coverage for the app tier (src/app: the tree mount alone;
// the rest of the boot code lives in @rtc/web-boot, which has its own gated
// tier).
// Reuses the base jsdom/react config; the `src/app` positional in the script
// scopes which tests RUN, coverage.include scopes the DENOMINATOR. The test
// HTML report is redirected to reports/app so it doesn't clobber reports/unit.
const config = mergeConfig(
  base,
  defineConfig({
    test: {
      coverage: {
        provider: "v8",
        // Count every src/app file so an untested one surfaces at 0%.
        include: ["src/app/**"],
        exclude: [
          // Vitest auto-excludes the *executed* test files (*.test.ts), but NOT
          // non-spec test-support modules (the __tests__/ render probes). The
          // broad src/app/** include would otherwise count them as production
          // source. Exclude the whole __tests__/ convention explicitly.
          "**/__tests__/**",
          "**/*.testHelpers.ts", // extracted test doubles, not production source
        ],
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "reports/app/coverage",
      },
    },
  }),
);

// Replaced after the merge, not declared above: mergeConfig CONCATENATES
// arrays, so re-declaring `reporters` would run the base's html reporter
// (writing reports/unit) alongside this one. Since vitest 5 the html
// reporter's location is its own `outputDir` option; `outputFile.html` is
// ignored.
config.test = {
  ...config.test,
  reporters: ["default", ["html", { outputDir: "reports/app/report" }]],
};

export default config;
