import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Terminal reporter unchanged; HTML is additive. The html reporter owns (and
  // wipes) ONLY report/; raw failure output (traces, screenshots) goes to the
  // artifacts/ sibling — never nest one inside the other. Paths are
  // config-file-relative (../../ = tests/).
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "../../reports/browser/playwright/report",
        open: "never",
      },
    ],
  ],
  outputDir: "../../reports/browser/playwright/artifacts",
  timeout: 30_000,
  use: {
    // Per-suite port via RTC_DEV_PORT (parallel runners); defaults to 3000.
    baseURL: `http://localhost:${process.env.RTC_DEV_PORT ?? 3000}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
