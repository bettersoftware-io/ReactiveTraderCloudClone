import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Tier 3: Vitest browser mode (`@vitest/browser` + `vitest-browser-react`) using
// the experimental `toMatchScreenshot` matcher (Vitest 4). Mounts the React
// harness in a real Chromium via the Playwright provider.
//
// Retired from the assert role by the 2026-07-20 test-tooling bake-off (see
// ../ADR-001-visual-diff-tooling.md's Outcome section): this tier's own
// goldens were deleted, and it now runs coverage-only via
// `vitest-browser.coverage.config.ts`, which merges this base config with
// `__RTC_VISUAL_SKIP_DIFF__: "true"` — the pixel assert below is compiled out,
// so no golden path resolution is needed here anymore.

export default defineConfig({
  plugins: [react()],
  define: {
    // The coverage config flips this to "true": render + interactions still run
    // (istanbul sees every branch) but the pixel assert is compiled out — its
    // goldens were retired when this tier left the CI-assert role (2026-07-20).
    __RTC_VISUAL_SKIP_DIFF__: "false",
  },
  resolve: {
    alias: {
      "@ui-visual": fileURLToPath(new URL("../react", import.meta.url)),
      // The shared scenario/goldenPath matrix, extracted to @rtc/ui-contract
      // (Task 3). Distinct name from `@ui-visual` above (that alias is the
      // framework-swap seam for the render target — see ../README.md — and
      // must not be repurposed for this unrelated, always-shared module).
      "@ui-visual-shared": fileURLToPath(
        new URL("../../../../../ui-contract/src/visual", import.meta.url),
      ),
    },
  },
  test: {
    // Pin root to the package dir (four levels up from this suite folder) so
    // `include` and screenshot paths are stable regardless of invocation cwd.
    root: fileURLToPath(new URL("../../../..", import.meta.url)),
    include: ["tests/ui/visual/vitest-browser/**/*.spec.tsx"],
    // Optional scenario filter — parity with the Playwright tier's `grep`.
    // SCENARIO_PATTERN (update-visual-goldens.yml's scenario_pattern input, or
    // local) narrows to matching test names; empty/unset = the full matrix. A
    // config value rather than the -t CLI flag so both tiers read the one
    // env var (and -t wouldn't forward cleanly through `pnpm run <script> --`).
    testNamePattern: process.env.SCENARIO_PATTERN || undefined,
    // HTML report (additive): test:ui:visual:vitest-browser:react =>
    // reports/ui/visual/vitest-browser/react/. outputFile is root-relative
    // (root is pinned to the package dir above). On failure the html reporter
    // embeds the actual/diff PNGs into report/data/, so the report is
    // self-contained.
    reporters: ["default", "html"],
    outputFile: {
      html: "reports/ui/visual/vitest-browser/react/report/index.html",
    },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
      // Realistic 1080p desktop, identical to the two Playwright runners
      // (was 1280×800) so full-page HUD captures aren't vertically squeezed.
      viewport: { width: 1920, height: 1080 },
      // comparatorName/comparatorOptions are vestigial since the 2026-07-20
      // bake-off retired this tier's assert role (goldens deleted, matcher
      // call compiled out via __RTC_VISUAL_SKIP_DIFF__ — see visual.spec.tsx).
      // Left in place only because `expect.toMatchScreenshot` is never
      // invoked, so these values are never read; harmless to keep, safe to
      // delete whenever this block is next touched.
      expect: {
        toMatchScreenshot: {
          comparatorName: "pixelmatch",
          comparatorOptions: { allowedMismatchedPixelRatio: 0.06 },
        },
      },
    },
  },
});
