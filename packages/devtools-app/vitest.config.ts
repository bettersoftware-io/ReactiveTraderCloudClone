import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // One VM context per test file, modules loaded once: ~3x less CPU than
    // re-importing jsdom and every module per file. See
    // docs/architecture/09-test-strategy.md §"The test pool".
    pool: "vmThreads",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.testHelpers.ts",
        "src/main.tsx",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
      // Same bar as the two web clients' ui:contract gates (ci.yml). Branches
      // at 85 for the same reason solid sits at 85: v8 counts every `?.` and
      // `??` as a branch pair, inflating the denominator on defensive code.
      thresholds: { statements: 95, lines: 95, functions: 95, branches: 85 },
    },
  },
});
