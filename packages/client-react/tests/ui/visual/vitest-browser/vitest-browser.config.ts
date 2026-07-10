import os from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

interface ScreenshotPathArgs {
  root: string;
  testFileDirectory: string;
  testFileName: string;
  arg: string;
  browserName: string;
  ext: string;
}

// Tier 3: Vitest browser mode (`@vitest/browser` + `vitest-browser-react`) using
// the experimental `toMatchScreenshot` matcher (Vitest 4). Mounts the React
// harness in a real Chromium via the Playwright provider and diffs against the
// SAME committed goldens as the other tiers.
//
// Goldens are routed by environment exactly like the Playwright tiers (see
// ../playwright/playwright.config.ts): CI (x86 Linux container) owns the
// canonical `react/` set; a local dev machine writes its own committed
// `react-local/<plat>-<arch>/` set, because font rasterization differs by
// OS/arch. See ../ADR-001-visual-diff-tooling.md.
const baseline = process.env.CI
  ? "react"
  : `react-local/${os.platform()}-${os.arch()}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-visual": fileURLToPath(new URL("../react", import.meta.url)),
    },
  },
  test: {
    // Pin root to the package dir (four levels up from this suite folder) so
    // `include` and screenshot paths are stable regardless of invocation cwd.
    root: fileURLToPath(new URL("../../../..", import.meta.url)),
    include: ["tests/ui/visual/vitest-browser/**/*.spec.tsx"],
    // HTML report (additive): test:ui:visual:vitest-browser:react =>
    // reports/ui/visual/vitest-browser/react/. outputFile is root-relative
    // (root is pinned to the package dir above). On failure the html reporter
    // also embeds the actual/diff PNGs into report/data/, so the report is
    // self-contained; the on-disk failure PNGs are routed next to the goldens
    // by `resolveDiffPath` below.
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
      // `toMatchScreenshot`'s built-in `screenshotDirectory` plumbing resolves a
      // custom value to an absolute path and then mis-joins it under the spec's
      // directory (producing a mangled `…/Users/…/…` path). Bypass it with our
      // own resolver, which deterministically yields:
      //   tests/ui/visual/vitest-browser/__screenshots__/<baseline>/<spec>/<arg>-<browser>.png
      // Arch lives in <baseline>, so the filename needs no platform suffix.
      expect: {
        toMatchScreenshot: {
          // Anti-aliasing parity with the Playwright tiers. Playwright's
          // toHaveScreenshot tolerates sub-pixel AA noise by default (per-pixel
          // threshold 0.2); vitest's toMatchScreenshot defaults to ZERO
          // tolerance, so interaction scenarios that re-layout (e.g. the blotter
          // after a filter applies) flake on a handful of AA pixels that never
          // stabilise ("matcher did not succeed in time"). This tier originally
          // used a 100-px absolute cushion on the theory that it "has not
          // exhibited" the x86 text-AA jitter the Playwright tiers absorb with
          // maxDiffPixelRatio: 0.06 (raised from 0.025) — falsified 2026-07-02:
          // once the v2 redesign filled the full-App FX shots with glow
          // text-shadows, gradient tiles and drop-shadowed bubbles, app/fx*
          // exceeded 100 mismatched px between otherwise-identical x86 CI runner
          // instances (passed one run, failed the next, same goldens). Use the
          // same 0.06 ratio as the other two tiers — the settled repo-wide AA
          // budget; genuine layout/structure regressions move far more pixels.
          comparatorName: "pixelmatch",
          comparatorOptions: { allowedMismatchedPixelRatio: 0.06 },
          resolveScreenshotPath: ({
            root,
            testFileDirectory,
            testFileName,
            arg,
            browserName,
            ext,
          }: ScreenshotPathArgs) => {
            return resolve(
              root,
              testFileDirectory,
              "__screenshots__",
              baseline,
              testFileName,
              `${arg}-${browserName}${ext}`,
            );
          },
          // Vitest's default `resolveDiffPath` drops failure artifacts into
          // `.vitest-attachments/…/<arg>-{actual,diff}-<browser>-<platform>.png`,
          // which the committed gitignore + CI failure-upload globs
          // (`__screenshots__/**/*-{actual,diff}.png`) never match. Route them
          // next to the golden they were compared against instead. The kind
          // suffix (`-reference`/`-actual`/`-diff`) arrives pre-appended to
          // `arg`, so re-order it after the browser name to mirror the golden's
          // filename and end in exactly `-actual.png`/`-diff.png`:
          //   golden  <arg>-chromium.png
          //   failure <arg>-chromium-actual.png / <arg>-chromium-diff.png
          // On mismatch Vitest writes ONLY the actual+diff here — the golden
          // path is written solely on --update or when a golden is missing.
          resolveDiffPath: ({
            root,
            testFileDirectory,
            testFileName,
            arg,
            browserName,
            ext,
          }: ScreenshotPathArgs) => {
            return resolve(
              root,
              testFileDirectory,
              "__screenshots__",
              baseline,
              testFileName,
              `${arg.replace(/-(reference|actual|diff)$/, `-${browserName}-$1`)}${ext}`,
            );
          },
        },
      },
    },
  },
});
