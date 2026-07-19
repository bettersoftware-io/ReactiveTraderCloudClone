import os from "node:os";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// Port map across the repo's visual/dev servers (no other config
// re-documents this — kept here since it's the newest solid entry):
//   3100 react playwright-ct (CT adapter's ctPort)
//   3200 react playwright (this tier's react counterpart)
//   3300 solid playwright (THIS config)
//   3400 solid playwright-ct (the fallback tier, see its config header)
//   5173 client-react dev, 5273 client-prototype dev, 5473 client-solid dev
const PORT = 3300;

// Assert-only tier: this package owns NO goldens (see the cross-package
// snapshotDir below). Goldens are entirely react's responsibility.
// `--update-snapshots` would happily write into react's committed tree via
// snapshotPathTemplate below, so refuse outright rather than silently
// clobbering another package's golden set. Mirrors the vitest-browser
// tier's `--update`/`-u` argv guard (../vitest-browser/vitest-browser.config.ts).
// Also covers playwright's short alias `-u` (equivalent to
// `--update-snapshots`) — without this, `-u` would slip past the guard and
// still flip `updateSnapshots` at runtime. `startsWith("-u")` catches every
// Commander-CLI short-flag shape: bare `-u`, `-u=X`, and the concatenated
// `-uX` form (e.g. `-uall`, `-umissing`) — playwright's `--help` confirms
// `-u` is the only short flag beginning with "u" in its whole CLI, so this
// has zero false-positive risk against any other flag.
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
      "`pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update` " +
      "there instead of passing --update-snapshots to this config.",
  );
}

// Same CI-vs-local baseline routing as react's own playwright.config.ts (see
// its header comment for the full cross-platform-pixel-drift rationale) and
// as this package's own vitest-browser tier.
const baseline = process.env.CI
  ? "react"
  : `react-local/${os.platform()}-${os.arch()}`;

// CROSS-PACKAGE: unlike react's own config (which owns its slice of the
// shared tree), this tier's snapshotDir is anchored INSIDE @rtc/ui-contract —
// this package writes and owns no goldens of its own (assert-only by
// construction, same design as ../vitest-browser/vitest-browser.config.ts).
// Goldens are generated exclusively from client-react's renders; solid only
// ever reads them. `updateSnapshots: "none"` below is the mechanical
// enforcement: Playwright's own default (`"missing"`) would silently CREATE a
// missing reference screenshot into this same cross-package path the first
// time a scenario name drifts — "none" makes that a hard failure instead,
// never a write.
const REACT_SNAPSHOT_DIR = fileURLToPath(
  new URL(
    "../../../../../ui-contract/goldens/playwright/__screenshots__",
    import.meta.url,
  ),
);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  snapshotDir: REACT_SNAPSHOT_DIR,
  snapshotPathTemplate: `{snapshotDir}/${baseline}/{testFileName}/{arg}{ext}`,
  // Belt-and-suspenders alongside the argv guard above: even if
  // `--update-snapshots` somehow reached this config (e.g. a future CLI
  // default change), "none" means Playwright never writes a snapshot from
  // this run — a missing/renamed golden is always a hard failure here, never
  // a silent new file under the ui-contract goldens tree. NOT the repo default
  // ("missing") — that default is exactly the auto-create hazard this tier
  // must not have.
  updateSnapshots: "none",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Cross-runner AA tolerance — copied verbatim from react's playwright.config.ts.
  // See that file for the full rationale (NOT a temporary mask; settled repo-wide
  // budget). This tier adds a framework swap on top of react's own cross-runner
  // AA noise, so it needs at least as much headroom, never less.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.06 } },
  // Terminal reporter unchanged; HTML is additive. report/ + artifacts/ stay
  // INSIDE this package (never cross-package — only the golden read crosses).
  reporter: [
    [process.env.CI ? "line" : "list"],
    [
      "html",
      {
        outputFolder: "../../../../reports/ui/visual/playwright/solid/report",
        open: "never",
      },
    ],
  ],
  outputDir: "../../../../reports/ui/visual/playwright/solid/artifacts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    // Realistic 1080p desktop, identical across all runners/frameworks so
    // full-page HUD captures aren't vertically squeezed and pixel counts line
    // up 1:1 against react's committed goldens.
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
