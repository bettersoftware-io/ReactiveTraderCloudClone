import os from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { playwright } from "@vitest/browser-playwright";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

interface ScreenshotPathArgs {
  root: string;
  testFileDirectory: string;
  testFileName: string;
  arg: string;
  browserName: string;
  ext: string;
}

// Tier 3: Vitest browser mode, SolidJS side. Mounts the Solid harness in a
// real Chromium via the Playwright provider and diffs against
// packages/client-react's COMMITTED goldens — this package owns NO goldens of
// its own (assert-only by construction): a pass proves pixel-level framework
// swappability between the react and solid render targets. There is
// deliberately no `:update` script wired for this config (see the
// `--update` guard below) — regenerating goldens is react's job.
//
// CROSS-PACKAGE DESIGN: every other tier config in this repo resolves
// `resolveScreenshotPath` under its OWN package's `root`. This one is the one
// exception — its screenshot (golden) path is anchored at
// REACT_SCREENSHOTS_ROOT (packages/client-react/tests/ui/visual/vitest-browser/
// __screenshots__), completely ignoring the `root` toMatchScreenshot hands it
// (which is THIS package's root). `resolveDiffPath`, by contrast, stays on the
// local `root` — failure artifacts (actual/diff PNGs) must never be written
// into client-react's tree. This split is intentional and is the crux of the
// "solid owns no goldens" design: never change resolveScreenshotPath to use
// the local root, and never write a golden from this config.
//
// Baseline routed by environment exactly like the react tier's own config
// (see ../../../../client-react/tests/ui/visual/vitest-browser/vitest-browser.config.ts
// and ../../../../client-react/tests/ui/visual/playwright/playwright.config.ts):
// CI (x86 Linux container) reads react's canonical `react/` set; a local dev
// machine reads react's own committed `react-local/<plat>-<arch>/` set (font
// rasterization differs by OS/arch, so solid must compare against the SAME
// arch's set it would produce were it react). See
// ../../../../client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md.
const baseline = process.env.CI
  ? "react"
  : `react-local/${os.platform()}-${os.arch()}`;

// Anchored at THIS config file's own location (packages/client-solid/tests/ui/
// visual/vitest-browser/), five levels up to `packages/`, then into
// client-react's committed screenshot tree — same depth as the
// `@ui-visual-shared` alias below (both climb from a tests/ui/visual/
// vitest-browser/ leaf to packages/, then descend into a sibling package).
const REACT_SCREENSHOTS_ROOT = fileURLToPath(
  new URL(
    "../../../../../client-react/tests/ui/visual/vitest-browser/__screenshots__",
    import.meta.url,
  ),
);

// Assert-only guard: this tier must never write a golden. `vitest --update`
// (or `-u`) flips toMatchScreenshot into write mode, which would silently
// create/overwrite files under client-react's committed tree via
// resolveScreenshotPath above — refuse to even start instead.
if (process.argv.includes("--update") || process.argv.includes("-u")) {
  throw new Error(
    "assert-only tier: goldens are owned by client-react — run " +
      "`pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:update` " +
      "there instead of passing --update/-u to this config.",
  );
}

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "@ui-visual": fileURLToPath(new URL("../solid", import.meta.url)),
      // The shared scenario/goldenPath matrix, extracted to @rtc/ui-contract.
      // Distinct name from `@ui-visual` above (that alias is the
      // framework-swap seam for the render target) — must not be repurposed
      // for this unrelated, always-shared module. Same relative depth as
      // react's own config (both climb 5 levels from a tests/ui/visual/
      // vitest-browser/ leaf to packages/, then into ui-contract/src/visual).
      "@ui-visual-shared": fileURLToPath(
        new URL("../../../../../ui-contract/src/visual", import.meta.url),
      ),
    },
  },
  test: {
    // Pin root to the package dir (four levels up from this suite folder) so
    // `include` is stable regardless of invocation cwd. NOTE: this root feeds
    // resolveDiffPath (local) but NOT resolveScreenshotPath (cross-package —
    // see REACT_SCREENSHOTS_ROOT above).
    root: fileURLToPath(new URL("../../../..", import.meta.url)),
    include: ["tests/ui/visual/vitest-browser/**/*.spec.tsx"],
    // HTML report (additive): test:ui:visual:vitest-browser:solid =>
    // reports/ui/visual/vitest-browser/solid/. outputFile is root-relative
    // (root is pinned to the package dir above). On failure the html reporter
    // also embeds the actual/diff PNGs into report/data/, so the report is
    // self-contained; the on-disk failure PNGs are routed next to the LOCAL
    // diff dir by `resolveDiffPath` below (never into client-react's tree).
    reporters: ["default", "html"],
    outputFile: {
      html: "reports/ui/visual/vitest-browser/solid/report/index.html",
    },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
      // Realistic 1080p desktop, identical to the react tier's own config so
      // full-page HUD captures aren't vertically squeezed and pixel counts
      // line up 1:1 against react's committed goldens.
      viewport: { width: 1920, height: 1080 },
      expect: {
        toMatchScreenshot: {
          // Anti-aliasing parity with the react tier — SAME 0.06 ratio (the
          // settled repo-wide AA budget across renderer/runner combinations;
          // see react's config for the full history of why this value was
          // chosen). Copied verbatim, never tightened or loosened: this tier
          // adds a framework swap on top of react's own cross-runner AA
          // noise, so it needs at least as much headroom, never less.
          comparatorName: "pixelmatch",
          comparatorOptions: { allowedMismatchedPixelRatio: 0.06 },
          resolveScreenshotPath: ({
            testFileName,
            arg,
            browserName,
            ext,
          }: ScreenshotPathArgs) => {
            // Deliberately ignores `root`/`testFileDirectory` (this
            // package's own paths) — resolves into client-react's committed
            // tree instead. See the module-level comment above.
            return resolve(
              REACT_SCREENSHOTS_ROOT,
              baseline,
              testFileName,
              `${arg}-${browserName}${ext}`,
            );
          },
          resolveDiffPath: ({
            root,
            testFileDirectory,
            testFileName,
            arg,
            browserName,
            ext,
          }: ScreenshotPathArgs) => {
            // Local root (THIS package) — failure artifacts never land in
            // client-react's tree. Kind suffix (`-reference`/`-actual`/
            // `-diff`) arrives pre-appended to `arg`; re-order it after the
            // browser name to mirror the golden's filename, mirroring react's
            // own resolveDiffPath exactly (just rooted locally).
            return resolve(
              root,
              testFileDirectory,
              "__diffs__",
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
