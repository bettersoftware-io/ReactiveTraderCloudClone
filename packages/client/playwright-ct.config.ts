import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";

export default defineConfig({
  testDir: "./visual",
  testMatch: "**/*.spec.tsx",
  snapshotDir: "./visual/__screenshots__",
  // Identical golden filename on every OS/arch so baselines are portable
  // across machines and (later) across the React/Solid harnesses.
  snapshotPathTemplate: "{snapshotDir}/{testFileName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    viewport: { width: 1280, height: 800 },
    ctViteConfig: { plugins: [react()] },
    ctPort: 3100,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
