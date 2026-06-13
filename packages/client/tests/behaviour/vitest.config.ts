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
  },
});
