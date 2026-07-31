import os from "node:os";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

// Goldens live in @rtc/ui-contract, beside the pixel-contract spec they assert
// against (scenarios.ts / scenarioActions.ts / fixtures.ts / goldenPath.ts) —
// generated exclusively from THIS package's renders (react is the reference
// renderer; solid's tiers assert against this same tree, never write it).
const GOLDENS_DIR = fileURLToPath(
  new URL(
    "../../../../../ui-contract/goldens/playwright/__screenshots__",
    import.meta.url,
  ),
);

// Two committed golden sets, routed by environment. CI renders on x86 Linux in
// the pinned Playwright container and owns the canonical `react/` baseline — the
// cross-framework portability contract. A local dev machine (e.g. Apple Silicon,
// linux-arm64) rasterizes fonts differently (FreeType/HarfBuzz + arch), so its
// pixels never match the x86 set; it gets its OWN committed baseline under
// `react-local/<platform>-<arch>/`. Both sets are versioned and reviewed at
// commit time, but only the x86 `react/` set is additionally re-rendered and
// enforced by the CI visual job (no CI runner reproduces a dev arch). So an
// intentional UI change means updating BOTH: `:update` locally for the arm64 set
// AND the update-visual-goldens workflow for the x86 set. See ../ADR-001-visual-diff-tooling.md.
const baseline = process.env.CI
  ? "react"
  : `react-local/${os.platform()}-${os.arch()}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  snapshotDir: GOLDENS_DIR,
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
  // Screenshot tolerance — MEASURED, not assumed. Re-derive with
  // /rtc:visual-tolerance-audit rather than adjusting this by feel.
  //
  // Measurement (2026-07-28): five full golden regenerations of the same
  // commit, landing on five distinct runner instances, compared pairwise —
  // 1,462 goldens x 10 pairs = 14,620 comparisons. Cross-run jitter was
  // **ZERO differing pixels**, and still zero with pixelmatch's anti-aliasing
  // discount disabled (`includeAA: true`), so it is not an artifact of AA
  // being ignored. The prior value of 0.06 was justified by "text-heavy
  // goldens show ~0.04 AA jitter"; that could not be reproduced at all — not
  // one dense-text golden differed, fxBlotter included.
  //
  // Why 0.005 and not 0: N samples cannot prove the hosted runner pool is
  // homogeneous (GitHub exposes instance names, never CPU models), so this
  // keeps real headroom over a measured floor of zero — 10,368 px on a
  // full-page 1920x1080 shot, 37 px on the smallest element capture
  // (jarvis-orb-attention, 87x84). A ratio is harsher on small captures, which
  // is why the floor is stated in pixels too.
  //
  // What the old value cost, concretely. A budget of 0.06 is not merely loose:
  // it is larger than a REAL change on these surfaces, because a dark HUD is
  // mostly background and glyphs are a small pixel fraction.
  //   - A complete two-column restructure of PreferencesModal moved 0.017.
  //   - The Jarvis feature shipped a header orb and a full overlay re-skin on
  //     2026-07-27; 58 goldens went stale and the tier stayed GREEN, because
  //     each change sat around 0.03. PR #422 refreshed 132 drifted goldens.
  // 0.005 catches both classes with margin to spare.
  //
  // Still true, and the reason this is not 0: a small pixel-ratio tolerance is
  // the correct way to compare goldens across machines (see PR #40 and the
  // HUD-redesign flake saga, project_visual_goldens_dual_set). Forcing
  // font-hinting off was evaluated and rejected — it reduces but does not
  // eliminate cross-microarch AA variance, at a high golden-churning cost.
  //
  // If this ever starts flaking: run the audit before raising it. A raise
  // without a measurement is what produced the blind spot above. And note a
  // PASSING run is still not evidence that layout is unchanged on a sparse
  // surface — structural assertions cover what pixels cannot (e.g.
  // PreferencesModalPage.rowCountInColumn).
  //
  // maxDiffPixels caps the RATIO's worst case. A ratio scales with area, so a
  // single number buys wildly different sensitivity across the 1,462 goldens
  // (measured 2026-07-31): 36 px on the smallest, 631 px at the median, and
  // 10,368 px on each of the 202 full-page 1920x1080 shots -- there, a 101x101
  // block could change and still pass. That is the same class of miss as the
  // Jarvis orb, merely 12x smaller, and it is worst exactly where regressions
  // hide best. Playwright takes Math.min(maxDiffPixels, ratio x area)
  // (playwright-core coreBundle.js, `compareBuffers`), so this only ever
  // TIGHTENS: full-page drops 10,368 -> 100 px, while the smallest capture
  // stays on its 36 px ratio budget and nothing needs re-baselining.
  //
  // Why 100 and not 0, given a measured floor of zero across ~20,500
  // comparisons: those samples describe TODAY's runner pool, not a future
  // container rebuild or microarch shift. The two failure directions are not
  // symmetric -- too tight red-lines all 1,462 goldens at once (loud, and
  // recoverable by regenerating), too loose hides a real change silently, which
  // is what actually happened twice here. 100 px is ~0.005% of a full-page
  // shot: negligible hiding power, real insurance.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.005, maxDiffPixels: 100 },
  },
  // Terminal reporter unchanged; HTML is additive. report/ + artifacts/ are
  // siblings (the html reporter wipes its own folder). ../../../../ = packages/client-react.
  reporter: [
    [process.env.CI ? "line" : "list"],
    [
      "html",
      {
        outputFolder: "../../../../reports/ui/visual/playwright/react/report",
        open: "never",
      },
    ],
  ],
  outputDir: "../../../../reports/ui/visual/playwright/react/artifacts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    // Render at a realistic 1080p desktop (overriding Desktop Chrome's cramped
    // 1280×720) so full-page HUD captures aren't vertically squeezed. The app is
    // height:100vh, so this viewport IS the full-page golden size. Kept identical
    // to the vitest-browser coverage instrument's viewport (the now-retired
    // playwright-ct tier matched too).
    viewport: { width: 1920, height: 1080 },
  },
  webServer: {
    // cwd for this command is the directory of THIS config file, so the host
    // vite config is addressed in-suite; `pnpm exec` resolves the vite binary
    // from the owning package regardless of cwd depth.
    command: "pnpm exec vite --config host/vite.config.ts",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
});
