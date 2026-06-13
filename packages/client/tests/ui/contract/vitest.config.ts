import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-contract": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    // Pin root to the package dir (THREE levels up from tests/ui/contract) so
    // include/setup/report paths are stable regardless of invocation cwd.
    root: fileURLToPath(new URL("../../..", import.meta.url)),
    environment: "jsdom",
    include: ["tests/ui/contract/specs/**/*.contract.spec.ts"],
    setupFiles: ["./tests/ui/contract/react/setup.ts"],
    passWithNoTests: false,
    reporters: ["default", "html"],
    outputFile: { html: "reports/ui/contract/report/index.html" },
    coverage: {
      provider: "v8",
      include: ["src/ui/**"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/ui/contract/coverage",
    },
  },
});
