import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@behaviour": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    // Pin root to the package dir (two levels up) so include/setup/report paths
    // are stable regardless of invocation cwd — mirrors the visual-diff configs.
    root: fileURLToPath(new URL("../..", import.meta.url)),
    environment: "jsdom",
    include: ["tests/behaviour/specs/**/*.behaviour.spec.ts"],
    setupFiles: ["./tests/behaviour/react/setup.ts"],
    passWithNoTests: false,
    reporters: ["default", "html"],
    outputFile: { html: "reports/behaviour/report/index.html" },
    coverage: {
      provider: "v8",
      // Count every UI component, even ones no behaviour spec mounts yet, so the
      // report surfaces wholly-untested files at 0% rather than omitting them.
      // Narrow this to specific components if the full-surface view is too noisy.
      include: ["src/ui/**"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/behaviour/coverage",
    },
  },
});
