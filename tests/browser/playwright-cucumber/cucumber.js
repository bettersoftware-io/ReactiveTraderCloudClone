// Cucumber 11 ESM config notes:
//
// - Flat shape (no `default:` wrapper). Cucumber loads this file as
//   `await import(url)` and treats `module.default` as the config directly,
//   so `export default { default: {...} }` fails schema validation. Trade-off:
//   only one profile is possible until this is reorganised into named exports.
//
// - No `loader: ["tsx/esm"]` here. tsx 4.21+'s initialize hook throws when
//   Cucumber invokes it via `node:module.register(specifier)` (Cucumber omits
//   the `data` arg). Instead, tsx is loaded via NODE_OPTIONS in
//   tests/package.json `test:browser:playwright-cucumber` script:
//   `NODE_OPTIONS='--import tsx/esm'`.
//
// - All paths below are CWD-relative (cucumber-js runs from tests/),
//   not config-file-relative.

export default {
  paths: ["specs/**/*.feature"],
  import: [
    "browser/testContext.ts",
    "browser/playwright-cucumber/*.ts",
    "browser/steps/*.steps.ts",
  ],
  format: ["progress-bar", "html:reports/browser/playwright-cucumber/report/index.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: process.env.CI ? 2 : 0,
  // Browser peers can't inject gateway lifecycle events through the DOM, so the
  // presenter-only reconnect scenario is excluded here. The presenter cucumber
  // configs override this with `tags: "@presenter"` and still run it.
  tags: "not @presenterOnly",
};
