import path from "node:path";

import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import createEsbuildPlugin from "@badeball/cypress-cucumber-preprocessor/esbuild";
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { defineConfig } from "cypress";

// Slow CI runners need more headroom for the app's connection to settle
// (Connecting → Connected) before timing-sensitive `.should()` assertions, and
// the cucumber-js `retry` does NOT apply to this Cypress suite — so retry flaky
// specs here too. Locally the fast path needs neither.
const isCI = !!process.env.CI;

/**
 * Aliases @cucumber/cucumber → a thin shim that wraps Given/When/Then handlers
 * in cy.wrap().then() so async step bodies (which return native Promises) are
 * presented to the preprocessor as Cypress Chainables — avoiding the v24+
 * native-Promise guard. The shim itself re-exports everything else from the
 * browser entrypoint unchanged.
 *
 * See docs/architecture.md §9.5 for the full seam description.
 */
const aliasCucumber: import("esbuild").Plugin = {
  name: "alias-cucumber",
  setup(build) {
    build.onResolve({ filter: /^@cucumber\/cucumber$/ }, () => {
      return {
        path: path.resolve(
          new URL(".", import.meta.url).pathname,
          "cucumber-shim.ts",
        ),
      };
    });
  },
};

export default defineConfig({
  e2e: {
    // Port overridable per-suite (RTC_DEV_PORT) so parallel browser suites each
    // target their own dev server; defaults to 3000 for standalone runs.
    baseUrl: `http://localhost:${process.env.RTC_DEV_PORT ?? 3000}`,
    specPattern: "specs/**/*.feature",
    supportFile: "browser/cypress-cucumber/e2e.ts",
    video: false,
    screenshotOnRunFailure: true,
    screenshotsFolder: "reports/browser/cypress-cucumber/artifacts",
    defaultCommandTimeout: isCI ? 30_000 : 10_000,
    retries: { runMode: isCI ? 2 : 0, openMode: 0 },
    async setupNodeEvents(on, config) {
      await addCucumberPreprocessorPlugin(on, config);
      on(
        "file:preprocessor",
        createBundler({
          plugins: [aliasCucumber, createEsbuildPlugin(config)],
        }),
      );
      return config;
    },
  },
});
