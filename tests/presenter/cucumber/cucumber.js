// tests/presenter/cucumber/cucumber.js — cucumber-js against live presenters,
// REAL timers (the default; the fake-timers variant lives in ../cucumber-fake-timers).
// All paths are CWD-relative (cucumber-js runs from tests/), not config-file-relative.
export default {
  paths: ["specs/**/*.feature"],
  import: [
    "presenter/cucumber/*.ts",
    "presenter/scenarios/_buildApp.ts",
    "presenter/scenarios/_shared/**/*.ts",
    "presenter/steps/**/*.ts",
  ],
  tags: "@presenter",
  format: ["progress-bar", "html:reports/presenter/cucumber/report/index.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: 0,
};
