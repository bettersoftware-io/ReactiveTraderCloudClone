import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";

const uiVisual = fileURLToPath(new URL("../react", import.meta.url));
// The shared scenario/goldenPath matrix, extracted to @rtc/ui-contract (Task
// 3) — distinct from `@ui-visual` above, which is the framework-swap render
// target seam and must not be repurposed for this unrelated module.
const uiVisualShared = fileURLToPath(
  new URL("../../../../../ui-contract/src/visual", import.meta.url),
);

// Goldens live under a per-framework subdir (`react/`) so a Solid run can write
// `solid/` alongside without colliding — that per-framework split is the
// cross-framework contract. A single container-canonical set: every arch
// regenerates/verifies through the pinned x86 container (`pnpm goldens:*`),
// byte-identical to CI, so there is no per-arch `react-local/<arch>/` set. See
// ../playwright/playwright.config.ts and ../ADR-001-visual-diff-tooling.md.
const baseline = "react";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.tsx",
  snapshotDir: "./__screenshots__",
  snapshotPathTemplate: `{snapshotDir}/${baseline}/{testFileName}/{arg}{ext}`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Optional scenario filter. SCENARIO_PATTERN (set by update-visual-goldens.yml's
  // scenario_pattern input, or locally) narrows the run to matching test titles;
  // empty/unset = the full theme matrix. Applied here as `grep` rather than via a
  // CLI `-g` arg because `pnpm run <script> -- -g X` double-dashes the arg and
  // playwright ignores it (so a targeted golden regen can't forward through pnpm).
  ...(process.env.SCENARIO_PATTERN
    ? { grep: new RegExp(process.env.SCENARIO_PATTERN) }
    : {}),
  // Serial worker pin — everywhere, not just locally. Each CT worker is its
  // own Chromium instance mounting components through a live-compiling Vite
  // dev server; under CPU contention a handful of scenarios' "wait for stable
  // frame" check can pass one frame before layout has actually settled —
  // producing a screenshot 1-7px off in width or height (not the AA colour
  // jitter the maxDiffPixelRatio below absorbs; a genuine dimension mismatch,
  // which toHaveScreenshot always hard-fails regardless of that ratio).
  // Serialized (--workers=1) runs were 100% reproducible across repeated
  // full-suite passes; default (CPU-count) parallelism flaked on a random
  // ~2-5% subset every run. Same oversubscription problem run-all.ts already
  // solves for cross-runner concurrency (see its top-of-file comment). First
  // observed on a darwin-arm64 dev box; then confirmed on CI x86 runners
  // (2026-07-02): an update-visual-goldens run and the very next ci.yml visual
  // run — same container image, same commit — disagreed on 25 CT fixtures by
  // 1-7px dimension drift, so both golden generation and comparison must run
  // serialized to be deterministic.
  workers: 1,
  // Cross-runner anti-aliasing tolerance. The component-test runner bundles each
  // scenario through its own privately-pinned vite (see ctViteConfig below) and
  // rasterizes text in isolation; glyph-edge anti-aliasing varies by ~1% of
  // pixels between otherwise-identical x86 CI runner instances (observed: a
  // text-heavy header strip diffing 883px / ratio 0.01 with byte-identical
  // layout, content and colour). With Playwright's default strict comparison
  // that AA jitter tips a random text-heavy golden over threshold on some runs,
  // reddening main with no real visual change. A small maxDiffPixelRatio absorbs
  // the AA noise while still catching genuine layout/structure regressions — the
  // goldens' actual job as the cross-framework portability contract — which move
  // far more than 6% of pixels. Raised from 0.025 to 0.06: text-heavy
  // fixed-dimension goldens (e.g. fxBlotter populated/sorted) show ~0.04 ratio
  // of sub-pixel AA jitter on x86 run-to-run (dimensions stable, content byte-
  // identical); 0.025 was too tight. The plain-Playwright and vitest-browser
  // tiers have not shown this jitter (different render pipelines).
  // This is a deliberate, settled decision, NOT a temporary mask to tighten
  // away — see ../playwright/playwright.config.ts for the full rationale and the
  // rejected "font-hinting-off + regenerate goldens" alternative.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.06 } },
  // Terminal reporter unchanged; HTML is additive. report/ + artifacts/ are
  // siblings (the html reporter wipes its own folder). ../../../../ = packages/client-react.
  reporter: [
    [process.env.CI ? "line" : "list"],
    [
      "html",
      {
        outputFolder:
          "../../../../reports/ui/visual/playwright-ct/react/report",
        open: "never",
      },
    ],
  ],
  outputDir: "../../../../reports/ui/visual/playwright-ct/react/artifacts",
  use: {
    // The CT host template (index.html + index.tsx) lives in-suite as host/,
    // symmetric with the plain-Playwright tier's host/ — instead of CT's default
    // root-level `playwright/` folder. Its bundling cache sits next to it
    // (gitignored).
    ctTemplateDir: "./host",
    ctCacheDir: "./host/.cache",
    // Viewport is overridden to a realistic 1920×1080 in the project below
    // (Desktop Chrome's default 1280×720 cramps the full-page HUD captures).
    ctViteConfig: {
      // Version-skew note (load-bearing): `react()` here is the app's
      // @vitejs/plugin-react@6 (peers vite ^8), but Playwright CT bundles this
      // harness with its OWN privately-pinned vite@6.4.1 — not the app's vite 8.
      // The lockfile does NOT protect this coupling (it's config-injected, not a
      // declared peer edge), so it rests on empirical green: the visual suite
      // passes 2/2 today. If a future plugin-react@6.x patch starts using a
      // vite-8-only build API, or a Playwright CT bump moves its bundled vite,
      // this runner can break with no package.json/lockfile change to warn you.
      plugins: [react()],
      resolve: {
        alias: { "@ui-visual": uiVisual, "@ui-visual-shared": uiVisualShared },
      },
    },
    ctPort: 3100,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Realistic 1080p desktop (see viewport note above); identical across
        // all three visual runners so full-page HUD shots aren't squeezed.
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
});
