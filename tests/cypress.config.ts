import { defineConfig } from "cypress";
import { createRequire } from "node:module";
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import createEsbuildPlugin from "@badeball/cypress-cucumber-preprocessor/esbuild";

const require = createRequire(import.meta.url);

/**
 * Aliases @cucumber/cucumber → @badeball/cypress-cucumber-preprocessor at
 * bundle time so step files can share one tree across both runners. See
 * docs/architecture.md §11 for the full seam description.
 */
const aliasCucumber: import("esbuild").Plugin = {
  name: "alias-cucumber",
  setup(build) {
    build.onResolve({ filter: /^@cucumber\/cucumber$/ }, () => ({
      path: require.resolve("@badeball/cypress-cucumber-preprocessor"),
    }));
  },
};

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "specs/**/*.feature",
    supportFile: "support/cypress/e2e.ts",
    video: false,
    screenshotOnRunFailure: true,
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
