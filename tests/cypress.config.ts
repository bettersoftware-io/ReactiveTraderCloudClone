import { defineConfig } from "cypress";
import { createRequire } from "node:module";
import path from "node:path";
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import createEsbuildPlugin from "@badeball/cypress-cucumber-preprocessor/esbuild";

const require = createRequire(import.meta.url);

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
    build.onResolve({ filter: /^@cucumber\/cucumber$/ }, () => ({
      path: path.resolve(
        new URL(".", import.meta.url).pathname,
        "support/cypress/cucumber-shim.ts"
      ),
    }));
  },
};

export default defineConfig({
  e2e: {
    // Port overridable per-suite (RTC_DEV_PORT) so parallel browser suites each
    // target their own dev server; defaults to 3000 for standalone runs.
    baseUrl: `http://localhost:${process.env.RTC_DEV_PORT ?? 3000}`,
    specPattern: "specs/**/*.feature",
    supportFile: "support/cypress/e2e.ts",
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    async setupNodeEvents(on, config) {
      await addCucumberPreprocessorPlugin(on, config);
      on(
        "file:preprocessor",
        createBundler({ plugins: [aliasCucumber, createEsbuildPlugin(config)] }),
      );
      return config;
    },
  },
});
