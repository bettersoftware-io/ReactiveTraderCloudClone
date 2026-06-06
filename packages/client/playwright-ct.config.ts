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
    viewport: { width: 1280, height: 800 },
    ctViteConfig: {
      plugins: [react()],
      resolve: { alias: { "@ui-harness": uiHarness } },
    },
    ctPort: 3100,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
