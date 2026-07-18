import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// ============================================================================
// LOCKED DECISION — playwright-ct FALLBACK, not the real CT adapter
// ============================================================================
// `@playwright/experimental-ct-solid` is unusable here: as of this tier's
// authoring (2026-07-17) it is stuck at 1.48.2 (last publish 2025-10-15),
// while this repo pins `@playwright/test` ^1.60.0 — and Playwright's CT
// packages are version-locked to the core `@playwright/test` release they
// ship alongside (see react's own playwright-ct.config.ts, whose
// `ctViteConfig` comment documents the same class of version-skew risk one
// level down, between its CT adapter's bundled vite and the app's vite).
// A ~12-minor-version gap is not a coupling anyone should paper over with a
// forced install.
//
// So this "playwright-ct tier" is a FALLBACK: a second full-page-style
// Playwright config + host (structurally identical to ../playwright/), driving
// the SAME shared scenario matrix via URL navigation instead of a CT `mount()`
// call, asserting against react's REAL playwright-ct golden tree
// (../../../../../client-react/tests/ui/visual/playwright-ct/__screenshots__/).
// No `@playwright/experimental-ct-*` package is a dependency of this package —
// do not add one.
//
// Framing parity: react's CT tier mounts `VisualScenario` directly into a
// bare host (`../../../../../client-react/tests/ui/visual/playwright-ct/host/`)
// whose ONLY page-level styling is `html,body{margin:0;padding:0;}` — no
// box-sizing reset, no font-family override, no `#root{height:100%}` (unlike
// the fuller reset in ../playwright/host/main.tsx, which mirrors the real
// app's own src/index.css). That minimal reset is NOT cosmetic: several
// scenarios differ in captured PIXEL DIMENSION between react's own Tier 2
// (playwright, full reset) and Tier 1 (playwright-ct, minimal reset) goldens
// — e.g. `tile/eurusd-up` is 328px wide under Tier 2's border-box reset vs
// 358px under Tier 1's content-box default (Tile's `.tile` rule sets
// `min-width: 280px` + `padding: 13px 14px 11px` + `border: 1px`; border-box
// resolves that to a 280px box, content-box adds the 28px padding + 2px
// border on top — exactly the observed 30px delta). So this fallback's host
// (./host/) deliberately reproduces react's CT host's MINIMAL reset, not the
// fuller one in ../playwright/host/ — see ./host/main.tsx.
//
// Revisit condition: once `@playwright/experimental-ct-solid` ships a release
// tracking a `@playwright/test` major/minor within this repo's pinned range,
// re-evaluate swapping this fallback for the real adapter (matching react's
// Tier 1 mount-based approach) — until then, this config is not a stopgap to
// "fix properly later" so much as a stable, intentional substitute; the two
// approaches converge on the same golden contract by construction (both
// target react's playwright-ct/__screenshots__/ tree).
//
// NOT INHERITED: react's playwright-ct.config.ts pins `workers: 1` because
// each CT worker there is its own Chromium mounting components through a
// privately-bundled per-worker Vite dev server — under CPU contention that
// per-worker bundling dimension drifted a scenario's layout by 1-7px before
// "stable frame" fired. This fallback has no per-worker bundling to drift:
// like ../playwright/playwright.config.ts, it drives one SHARED webServer
// (a single Vite instance) via plain URL navigation, so react's root cause
// for the pin doesn't apply here — default parallelism is used, same as the
// ../playwright/ tier.
// ============================================================================

// Port map — see ../playwright/playwright.config.ts's header for the full
// list (3100 react ct, 3200 react playwright, 3300 solid playwright, 3400
// solid playwright-ct/THIS config).
const PORT = 3400;

// Assert-only tier: see ../playwright/playwright.config.ts for the full
// rationale (byte-identical guard) — this package owns NO goldens, and
// `--update-snapshots` (nor its short alias `-u`, in any of its bare/`-u=X`/
// concatenated `-uX` forms — e.g. `-uall`, `-umissing`) must never be able
// to write into client-react's tree.
if (
  process.argv.some((arg) => {
    return (
      arg === "--update-snapshots" ||
      arg.startsWith("--update-snapshots=") ||
      arg.startsWith("-u")
    );
  })
) {
  throw new Error(
    "assert-only tier: goldens are owned by client-react — run " +
      "`pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react:update` " +
      "there instead of passing --update-snapshots to this config.",
  );
}

// Single container-canonical `react/` set, same as every other tier in this repo.
const baseline = "react";

// CROSS-PACKAGE: anchored at react's playwright-ct golden tree — the fallback
// tier's whole point is to assert against the SAME golden set a real Solid CT
// adapter would (see the decision header above). This package owns no
// goldens of its own.
const REACT_SNAPSHOT_DIR = fileURLToPath(
  new URL(
    "../../../../../client-react/tests/ui/visual/playwright-ct/__screenshots__",
    import.meta.url,
  ),
);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.tsx",
  snapshotDir: REACT_SNAPSHOT_DIR,
  // `{testFileName}` resolves to this suite's own spec file's basename — named
  // `matrix.spec.tsx` (see ./matrix.spec.tsx) specifically so this resolves to
  // the SAME path segment as react's CT spec, even though this fallback's
  // spec contains no JSX. Matching the filename is what matters here, not its
  // contents — see the decision header above.
  snapshotPathTemplate: `{snapshotDir}/${baseline}/{testFileName}/{arg}{ext}`,
  // See ../playwright/playwright.config.ts for why "none" (not the repo
  // default "missing") — the argv guard above is belt-and-suspenders on top.
  updateSnapshots: "none",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Cross-runner AA tolerance — copied verbatim from react's own configs (both
  // playwright.config.ts and playwright-ct.config.ts use the same value). See
  // those files for the full rationale.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.06 } },
  reporter: [
    [process.env.CI ? "line" : "list"],
    [
      "html",
      {
        outputFolder:
          "../../../../reports/ui/visual/playwright-ct/solid/report",
        open: "never",
      },
    ],
  ],
  outputDir: "../../../../reports/ui/visual/playwright-ct/solid/artifacts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1920, height: 1080 },
  },
  webServer: {
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
