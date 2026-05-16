// tests/cucumber-presenter-real.js
export default {
  paths: ["specs/**/*.feature"],
  import: [
    "support/presenter/cucumber-real/**/*.ts",
    "scenarios/presenter/_buildApp.ts",
    "scenarios/presenter/cucumber-real/**/*.ts",
    "steps/presenter/cucumber-real/**/*.ts",
  ],
  tags: "@presenter",
  format: ["progress-bar", "html:reports/cucumber-presenter-real.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: 0,
};
