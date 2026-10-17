import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // threads, not vmThreads like every other package: these tests drive Node
    // built-ins (http, streams), whose errors come from Node's realm, so
    // `instanceof Error` reads false inside a VM context. See
    // docs/architecture/09-test-strategy.md §"The test pool".
    pool: "threads",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // HTML report (additive; terminal output unchanged). Bare `test` maps to
    // reports/unit/ per the repo-wide rule: test:<a>:<b> => reports/<a>/<b>/.
    reporters: ["default", ["html", { outputDir: "reports/unit/report" }]],
    coverage: {
      provider: "v8",
      // Count every src file (even ones no test imports) so wholly-untested
      // modules surface at 0% rather than vanishing from the denominator.
      include: ["src/**"],
      exclude: [
        "src/index.ts", // HTTP/WS bootstrap; binds a port on import, not unit-testable
        // without a production refactor — covered by tests/fullstack smokes
        "src/services/serviceContainer.ts", // pure `new X()` wiring; covered by the smokes
        "**/*.testHelpers.ts", // extracted test doubles, not production source
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
    },
  },
});
