import { mergeConfig, defineConfig } from "vitest/config";
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
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "reports/app/coverage",
      },
    },
  }),
);
