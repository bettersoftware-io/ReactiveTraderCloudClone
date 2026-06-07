// tests/raw/cypress/cypress.config.ts
import { defineConfig } from "cypress";

// On a loaded CI runner the app's connection settle (Connecting → Connected,
// driven by an rxjs timer) can take well over the local ~1s, and the
// `.should()`-retry assertions that gate on it (e.g. setBrowserOffline waiting
// for "Connected") only partially yield to the AUT. Give CI more headroom and
// retry a flaky spec; locally the fast path needs neither.
const isCI = !!process.env.CI;

export default defineConfig({
  e2e: {
    // Per-suite port via RTC_DEV_PORT (parallel runners); defaults to 3000.
    baseUrl: `http://localhost:${process.env.RTC_DEV_PORT ?? 3000}`,
    specPattern: "raw/cypress/**/*.spec.ts",
    supportFile: "raw/cypress/_context.ts",
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: isCI ? 30_000 : 10_000,
    retries: { runMode: isCI ? 2 : 0, openMode: 0 },
  },
});
