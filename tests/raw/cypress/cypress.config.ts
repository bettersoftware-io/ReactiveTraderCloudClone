// tests/raw/cypress/cypress.config.ts
import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    // Per-suite port via RTC_DEV_PORT (parallel runners); defaults to 3000.
    baseUrl: `http://localhost:${process.env.RTC_DEV_PORT ?? 3000}`,
    specPattern: "raw/cypress/**/*.spec.ts",
    supportFile: "raw/cypress/_context.ts",
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10_000,
  },
});
