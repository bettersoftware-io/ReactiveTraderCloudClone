import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/parity.json"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
      // Same bar as the other ≥95% gated packages (ci.yml). Branches at 85
      // for the same reason: v8 counts every `?.` and `??` as a branch pair,
      // inflating the denominator on defensive code.
      thresholds: { statements: 95, lines: 95, functions: 95, branches: 85 },
    },
  },
});
