import { defineConfig, devices } from "@playwright/test";

/**
 * Hybrid data-source smoke (hardening spec §8). Like fullstack/browser, this
 * drives the real client against the real backend — but the client is
 * composed HYBRID (VITE_SERVER_URL + VITE_DEMO_AUTH), so the login decides the
 * data source. The client + server processes are started by
 * fullstack/hybrid-smoke.ts; this config only points Playwright at the client.
 */
const CLIENT_PORT = Number(process.env.FULLSTACK_CLIENT_PORT ?? 3101);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Terminal reporter unchanged; HTML is additive. report/ + artifacts/ are
  // siblings (the html reporter wipes its own folder). Config-file-relative.
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "../../reports/fullstack/hybrid/report", open: "never" },
    ],
  ],
  outputDir: "../../reports/fullstack/hybrid/artifacts",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${CLIENT_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
