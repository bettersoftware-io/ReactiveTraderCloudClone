// tests/cucumber-presenter-fake.js
export default {
  paths: ["specs/**/*.feature"],
  import: [
    "support/presenter/cucumber-fake/**/*.ts",
    "scenarios/presenter/_buildApp.ts",
    "scenarios/presenter/_await.ts",
    "scenarios/presenter/cucumber-real/**/*.ts",
    "steps/presenter/cucumber-real/**/*.ts",
  ],
  tags: "@presenter",
  format: ["progress-bar", "html:reports/cucumber-presenter-fake.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: 0,
};
