import os from "node:os";
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const uiHarness = fileURLToPath(new URL("../react", import.meta.url));

// Goldens live under a per-framework subdir (`react/`) so a future Solid run can
// write `solid/` alongside without colliding — that per-framework split is the
// cross-framework contract. Orthogonally, the leading segment is routed by
// environment: CI (x86 Linux container) owns the canonical `react/` set; a local
// dev machine writes its own committed `react-local/<platform>-<arch>/` set,
// because font rasterization differs by OS/arch and never matches the x86 set.
// See ../playwright/playwright.config.ts and ../ADR-001-visual-diff-tooling.md
// for the full rationale.
const baseline = process.env.CI ? "react" : `react-local/${os.platform()}-${os.arch()}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.tsx",
  snapshotDir: "./__screenshots__",
  snapshotPathTemplate: `{snapshotDir}/${baseline}/{testFileName}/{arg}{ext}`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    // The CT host template (index.html + index.tsx) lives in-suite as host/,
    // symmetric with the plain-Playwright tier's host/ — instead of CT's default
    // root-level `playwright/` folder. Its bundling cache sits next to it
    // (gitignored).
    ctTemplateDir: "./host",
    ctCacheDir: "./host/.cache",
    // Desktop Chrome's 1280×720 viewport (from the project's device descriptor)
    // applies; no explicit override needed.
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
      resolve: { alias: { "@ui-harness": uiHarness } },
    },
    ctPort: 3100,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
