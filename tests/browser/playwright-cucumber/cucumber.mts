import type { IConfiguration } from "@cucumber/cucumber/api";

// Cucumber 11 ESM config notes:
//
// - Flat shape (no `default:` wrapper). Cucumber loads this file as
//   `await import(url)` and treats `module.default` as the config directly,
//   so `export default { default: {...} }` fails schema validation. Trade-off:
//   only one profile is possible until this is reorganised into named exports.
//
// - No loader. The step definitions and support files are TypeScript that
//   Node runs directly (it strips the types), so their relative and `#/`
//   imports spell out the `.ts` extension.
//
// - All paths below are CWD-relative (cucumber-js runs from tests/),
//   not config-file-relative.

// The solid variant (tests/package.json test:browser:playwright-cucumber:solid)
// reuses this SAME config with RTC_CLIENT_PKG=@rtc/client-solid, and run-all.ts
// runs every browser suite concurrently by default — so suffix the HTML report
// path by client to avoid two runs writing the same file at once. Empty for
// the react default keeps its report path byte-identical to before. Likewise
// for the application core (RTC_CORE_IMPL, forwarded to the dev server as
// VITE_CORE_IMPL by tests/scripts/clientServer.ts): the async/effect e2e runs
// (test:e2e:async/:effect) can be mid-flight alongside the default rxjs run.
const isSolid = process.env.RTC_CLIENT_PKG === "@rtc/client-solid";
const coreImpl: string = process.env.RTC_CORE_IMPL ?? "rxjs";
const reportSuffix: string = `${isSolid ? "-solid" : ""}${coreImpl === "rxjs" ? "" : `-${coreImpl}`}`;

const config: Partial<IConfiguration> = {
  paths: ["specs/**/*.feature"],
  // `browser/playwright-cucumber/*.ts` is single-level and unfiltered, so
  // cucumber EXECUTES every .ts sitting directly in that folder. A vitest
  // `*.test.ts` placed there is therefore loaded by cucumber too, and its
  // top-level `describe()` throws outside a vitest run — taking the whole suite
  // down before a single scenario executes. Unit tests for that folder live in
  // its `__tests__/` subdirectory, which this glob does not reach.
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

export default config;
