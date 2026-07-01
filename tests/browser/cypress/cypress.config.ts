// tests/browser/cypress/cypress.config.ts
import { defineConfig } from "cypress";
import mochawesomePlugin from "cypress-mochawesome-reporter/plugin";

// On a loaded CI runner the app's connection settle (Connecting → Connected,
// driven by an rxjs timer) can take well over the local ~1s, so give CI a
// larger per-command timeout. Test-level `retries` are deliberately NOT used:
// the flakes they once masked (timer starvation, dropped synthetic offline
// dispatch, detached-element re-render races) are fixed at source in the
// scenarios + page objects. Retrying a spec is wasteful and hides regressions.
const isCI = !!process.env.CI;

export default defineConfig({
  // HTML report via cypress-mochawesome-reporter (Cypress has no built-in
  // HTML). reportDir is projectRoot-relative (tests/). The reporter owns and
  // cleans ONLY report/; raw failure screenshots land in the artifacts/
  // sibling and are ALSO embedded (base64) into the report itself.
  reporter: "cypress-mochawesome-reporter",
  reporterOptions: {
    reportDir: "reports/browser/cypress/report",
    reportFilename: "index",
    overwrite: true,
    html: true,
    json: false,
    embeddedScreenshots: true,
    inlineAssets: true,
  },
  e2e: {
    // Per-suite port via RTC_DEV_PORT (parallel runners); defaults to 3000.
    baseUrl: `http://localhost:${process.env.RTC_DEV_PORT ?? 3000}`,
    specPattern: "browser/cypress/**/*.spec.ts",
    supportFile: "browser/cypress/_context.ts",
    video: false,
    screenshotOnRunFailure: true,
    screenshotsFolder: "reports/browser/cypress/artifacts",
    defaultCommandTimeout: isCI ? 30_000 : 10_000,
    retries: { runMode: 0, openMode: 0 },
    setupNodeEvents(
      on: Cypress.PluginEvents,
      config: Cypress.PluginConfigOptions,
    ): Cypress.PluginConfigOptions {
      mochawesomePlugin(on);
      return config;
    },
  },
});
