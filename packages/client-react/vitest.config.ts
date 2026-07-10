import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-contract": fileURLToPath(
        new URL("./tests/ui/contract/shared", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/ui/contract/specs/**/*.contract.spec.ts",
      "tests/ui/visual/**/*.test.ts",
      "tests/ui/visual/**/*.test.tsx",
    ],
    setupFiles: [
      "./tests/setup/jsdom-storage.ts",
      "./tests/ui/contract/react/setup.ts",
    ],
    passWithNoTests: true,
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
  },
});
