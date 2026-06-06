import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const uiHarness = fileURLToPath(new URL("./visual/react", import.meta.url));

export default defineConfig({
  testDir: "./visual/playwright-ct",
  testMatch: "**/*.spec.tsx",
  snapshotDir: "./visual/playwright-ct/__screenshots__",
  // React goldens live under a per-framework subdir so a future Solid run can
  // write ./solid/ alongside without colliding. Identical filename on every
  // OS/arch keeps baselines portable across machines.
  snapshotPathTemplate: "{snapshotDir}/react/{testFileName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
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
