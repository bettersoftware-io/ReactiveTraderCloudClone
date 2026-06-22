import { defineConfig, devices } from "@playwright/test";

/**
 * Full-stack browser smoke. Unlike the eight-runner suite (which runs the
 * client against in-process simulators), this drives the real built client
 * connected to the real backend. The client + server processes are started by
 * fullstack/browser-smoke.ts; this config only points Playwright at the client.
 */
const CLIENT_PORT = Number(process.env.FULLSTACK_CLIENT_PORT ?? 3100);

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
      { outputFolder: "../../reports/fullstack/browser/report", open: "never" },
    ],
  ],
  outputDir: "../../reports/fullstack/browser/artifacts",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${CLIENT_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
