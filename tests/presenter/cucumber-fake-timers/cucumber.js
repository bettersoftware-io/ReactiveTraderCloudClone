// tests/presenter/cucumber-fake-timers/cucumber.js — cucumber-js against live
// presenters with @sinonjs/fake-timers (virtual time; see hooks.ts).
// All paths are CWD-relative (cucumber-js runs from tests/), not config-file-relative.
export default {
  paths: ["specs/**/*.feature"],
  import: [
    "presenter/cucumber-fake-timers/*.ts",
    "presenter/scenarios/_buildApp.ts",
    // Explicit because this suite's world.ts imports _await.ts type-only; the
    // real-timers peer omits it (its world.ts value-imports RealAwaitHelpers).
    "presenter/scenarios/_await.ts",
    "presenter/scenarios/_shared/**/*.ts",
    "presenter/steps/**/*.ts",
  ],
  tags: "@presenter",
  format: ["progress-bar", "html:reports/cucumber-presenter-fake-timers.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: 0,
};
