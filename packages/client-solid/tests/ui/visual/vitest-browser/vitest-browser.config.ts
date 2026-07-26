import { fileURLToPath } from "node:url";

import { playwright } from "@vitest/browser-playwright";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

// The Solid twin of client-react's vitest-browser tier — with one deliberate
// simplification. React's carries a `__RTC_VISUAL_SKIP_DIFF__` define so its
// pixel assert can be compiled out, a vestige of the assert role it lost in the
// 2026-07-20 bake-off. This tier never had that role to lose: client-solid owns
// no goldens at all (its playwright tier asserts against the react-generated
// set in @rtc/ui-contract). So there is no flag and no assert here rather than
// a flag permanently pinned true guarding a branch that can never run.
//
// Everything else mirrors the react base config: the same shared scenario
// matrix via @ui-visual-shared, the same 1920x1080 viewport as both Playwright
// runners, and the same SCENARIO_PATTERN filter.

export default defineConfig({
  // `vite-plugin-solid` compiles the JSX; the package's own vite.config.ts uses
  // the same plugin for the app build.
  plugins: [solid()],
  resolve: {
    alias: {
      // The framework-swap render-target seam — points at THIS package's
      // Solid VisualScenario, where react's points at its own.
      "@ui-visual": fileURLToPath(new URL("../solid", import.meta.url)),
      // The always-shared scenario/goldenPath matrix in @rtc/ui-contract.
      // Deliberately a distinct alias from @ui-visual above (see ../README.md).
      "@ui-visual-shared": fileURLToPath(
        new URL("../../../../../ui-contract/src/visual", import.meta.url),
      ),
    },
  },
  test: {
    // Pin root to the package dir so `include` is stable regardless of cwd.
    root: fileURLToPath(new URL("../../../..", import.meta.url)),
    include: ["tests/ui/visual/vitest-browser/**/*.spec.tsx"],
    // Parity with the Playwright tier's grep; a config value rather than -t so
    // both tiers read the one env var.
    testNamePattern: process.env.SCENARIO_PATTERN || undefined,
    reporters: ["default", "html"],
    outputFile: {
      html: "reports/ui/visual/vitest-browser/solid/report/index.html",
    },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
      viewport: { width: 1920, height: 1080 },
    },
  },
});
