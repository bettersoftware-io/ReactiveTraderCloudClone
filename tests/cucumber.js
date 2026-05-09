export default {
  paths: ["specs/**/*.feature"],
  import: ["support/**/*.ts", "steps/browser/**/*.ts"],
  format: ["progress-bar", "html:reports/cucumber.html", "summary"],
  parallel: process.env.CI ? 1 : 2,
  retry: process.env.CI ? 2 : 0,
  publishQuiet: true,
};
