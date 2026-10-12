import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./tests/setup/jsdom-storage.ts"],
    passWithNoTests: true,
    reporters: ["default", ["html", { outputDir: "reports/unit/report" }]],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**", "src/index.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
      // Same bar as the other gated packages (ci.yml).
      thresholds: { statements: 95, lines: 95, functions: 95, branches: 85 },
    },
  },
});
