import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The shared scenario/goldenPath matrix (@rtc/ui-contract, Task 3) —
      // resolveScenarioData.test.ts imports the Scenario type from it.
      "@ui-visual-shared": fileURLToPath(
        new URL("../ui-contract/src/visual", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    // NOTE: contract specs (formerly tests/ui/contract/specs/**) moved to
    // @rtc/ui-contract in Task 3 and are exercised exclusively via the
    // dedicated tests/ui/contract/vitest.config.ts (`test:ui:contract`), not
    // this plain-`pnpm test` config — so its now-vestigial include entry and
    // the contract driver setupFile (below) were removed rather than
    // repointed at the new location.
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/ui/visual/**/*.test.ts",
      "tests/ui/visual/**/*.test.tsx",
    ],
    setupFiles: ["./tests/setup/jsdom-storage.ts"],
    passWithNoTests: true,
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
  },
});
