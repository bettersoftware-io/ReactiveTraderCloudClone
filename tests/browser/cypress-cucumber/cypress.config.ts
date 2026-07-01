import path from "node:path";

import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
// Named import: the /esbuild entry exports `createEsbuildPlugin` as a named
// export (no default). A default import only worked under older Cypress by
// CJS/ESM interop luck; Cypress 15.17 changed config transpilation and broke it.
import { createEsbuildPlugin } from "@badeball/cypress-cucumber-preprocessor/esbuild";
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { defineConfig } from "cypress";
import mochawesomePlugin from "cypress-mochawesome-reporter/plugin";

// Slow CI runners need more headroom for the app's connection to settle
// (Connecting → Connected) before timing-sensitive `.should()` assertions, so
// give CI a larger per-command timeout. Test-level `retries` are deliberately
// NOT used: the flakes they once masked (timer starvation, dropped synthetic
// offline dispatch, detached-element re-render races, record/expect ordering)
// are now fixed at source in the shared scenarios + Cypress page objects.
// Retrying a whole spec is wasteful and hides regressions; a clean run is the
// contract.
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
  setup(build: import("esbuild").PluginBuild): void {
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
  // HTML report via cypress-mochawesome-reporter — the SAME reporter-level
  // mechanism the native Cypress suite uses (browser/cypress/cypress.config.ts).
  // We deliberately do NOT use the cucumber-preprocessor's own `html` report
  // (disabled in .cypress-cucumber-preprocessorrc.json): that report is built
  // from IN-PAGE cucumber message events, and a mid-scenario `cy.reload()`
  // (e.g. specs/theme.feature "theme persists across page reloads") tears down
  // that in-page state, so the after-each hook throws "Expected there to be a
  // timestamp for current step" — a flake that burned all `retries` and only
  // cleared on a whole-job re-run. mochawesome reports at the Node/Mocha
  // reporter level, which never sees the page reload, so the failure mode is
  // structurally impossible. Disabling the preprocessor reports also flips its
  // `isTrackingState` to false, making the throwing code path unreachable.
  reporter: "cypress-mochawesome-reporter",
  reporterOptions: {
    reportDir: "reports/browser/cypress-cucumber/report",
    reportFilename: "index",
    overwrite: true,
    html: true,
    json: false,
    embeddedScreenshots: true,
    inlineAssets: true,
  },
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
    retries: { runMode: 0, openMode: 0 },
    async setupNodeEvents(
      on: Cypress.PluginEvents,
      config: Cypress.PluginConfigOptions,
    ): Promise<Cypress.PluginConfigOptions> {
      mochawesomePlugin(on);
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
