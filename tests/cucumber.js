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
//   tests/package.json `test:e2e` script: `NODE_OPTIONS='--import tsx/esm'`.

export default {
  paths: ["specs/**/*.feature"],
  import: ["support/**/*.ts", "steps/browser/**/*.ts"],
  format: ["progress-bar", "html:reports/cucumber.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: process.env.CI ? 2 : 0,
};
