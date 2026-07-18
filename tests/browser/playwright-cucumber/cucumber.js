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

// The solid variant (tests/package.json test:browser:playwright-cucumber:solid)
// reuses this SAME config with RTC_CLIENT_PKG=@rtc/client-solid, and run-all.ts
// runs every browser suite concurrently by default — so suffix the HTML report
// path by client to avoid two runs writing the same file at once. Empty for
// the react default keeps its report path byte-identical to before.
const reportSuffix =
  process.env.RTC_CLIENT_PKG === "@rtc/client-solid" ? "-solid" : "";

export default {
  paths: ["specs/**/*.feature"],
  import: [
    "browser/testContext.ts",
    "browser/playwright-cucumber/*.ts",
    "browser/steps/*.steps.ts",
  ],
  format: [
    "progress-bar",
    `html:reports/browser/playwright-cucumber${reportSuffix}/report/index.html`,
    "summary",
  ],
  // PWCUCUMBER_HEADED (the :headed script) forces a single worker so the run
  // is one followable window — otherwise each cucumber worker launches its own
  // visible browser. CI already pins 1; both are the "watchable run" path.
  parallel: process.env.CI || process.env.PWCUCUMBER_HEADED ? 1 : 2,
  retry: process.env.CI ? 2 : 0,
  // Browser peers can't inject gateway lifecycle events through the DOM, so the
  // presenter-only reconnect scenario is excluded here. The presenter cucumber
  // configs override this with `tags: "@presenter"` and still run it.
  tags: "not @presenterOnly",
};
