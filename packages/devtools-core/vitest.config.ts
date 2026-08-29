import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // HTML report (additive; terminal output unchanged). Bare `test` maps to
    // reports/unit/ per the repo-wide rule: test:<a>:<b> => reports/<a>/<b>/.
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
      // Same bar as the two web clients' ui:contract gates (ci.yml). Branches
      // at 85 for the same reason solid sits at 85: v8 counts every `?.` and
      // `??` as a branch pair, inflating the denominator on defensive code.
      thresholds: { statements: 95, lines: 95, functions: 95, branches: 85 },
    },
  },
});
