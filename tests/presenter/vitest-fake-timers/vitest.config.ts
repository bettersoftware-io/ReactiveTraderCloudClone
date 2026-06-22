// tests/presenter/vitest-fake-timers/vitest.config.ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // The config lives two levels below the package root; pin `root` back to
  // tests/ so `include` stays package-root-relative like every other suite.
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    include: ["presenter/vitest-fake-timers/**/*.test.ts"],
    // HTML report (additive): test:presenter:vitest-fake-timers =>
    // reports/presenter/vitest-fake-timers/. outputFile is root-relative (tests/).
    reporters: ["default", "html"],
    outputFile: {
      html: "reports/presenter/vitest-fake-timers/report/index.html",
    },
    pool: "threads",
  },
});
