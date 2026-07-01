import os from "node:os";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

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
  snapshotDir: "./__screenshots__",
  snapshotPathTemplate: `{snapshotDir}/${baseline}/{testFileName}/{arg}{ext}`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Tolerate cross-CI-runner anti-aliasing jitter (~1-4% of pixels, byte-identical
  // layout) the same way the playwright-ct tier does: glyph-edge AA varies between
  // the runner that renders the goldens (update-visual-goldens workflow) and the
  // runner that verifies them (the `visual` CI job), tipping a random text-heavy
  // golden over a strict threshold with no real change. Raised from 0.025 to
  // 0.06: text-heavy fixed-dimension goldens (e.g. fxBlotter populated/sorted)
  // show ~0.04 ratio of sub-pixel AA jitter on x86 run-to-run; 0.025 was too
  // tight. 0.06 still catches layout/structure regressions (which move >> 6%).
  // See project_visual_goldens_dual_set / PR #40 (playwright-ct precedent).
  //
  // NOT A TEMPORARY MASK — DO NOT "tighten this away". Sub-pixel glyph AA is
  // non-deterministic ACROSS x86 CI runner instances (FreeType/HarfBuzz
  // rasterization rounds differently per microarchitecture) even inside the
  // byte-identical pinned Playwright container. A small pixel-ratio tolerance is
  // the standard, correct way to compare pixel goldens across machines — it is
  // the SOLUTION here, not a shortcut. The "fix it for good" alternative (force
  // Chromium font-hinting off via launch flags, then regenerate BOTH committed
  // golden sets — x86 `react/` via the update-visual-goldens workflow AND the
  // local `react-local/<arch>/` set — and re-stabilise over several CI cycles)
  // was evaluated and deliberately rejected: those flags only REDUCE, not
  // eliminate, cross-microarch AA variance, so the payoff is a marginally
  // tighter threshold at a high, CI-only, golden-churning cost. If AA jitter
  // ever exceeds ~0.05, first check it is not a REAL regression (those move far
  // past 6%); only then revisit. History: this is the settled decision after the
  // HUD-redesign visual-flake saga (see project_hud_redesign_workstream).
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.06 } },
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
    // Desktop Chrome's 1280×720 viewport applies (the device descriptor below
    // sets it); kept consistent with the other runners.
    ...devices["Desktop Chrome"],
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
