import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // HTML report (additive; terminal output unchanged). Bare `test` maps to
    // reports/unit/ per the repo-wide rule: test:<a>:<b> => reports/<a>/<b>/.
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
    coverage: {
      provider: "v8",
      // Count every src TypeScript file (even ones no test imports) so
      // wholly-untested modules surface at 0% rather than vanishing from the
      // denominator. Scoped to *.ts so non-code fixtures under src/ — the
      // __golden__/*.original.json reference data and README.golden.md — aren't
      // counted as 0%-covered "source" (they carry no executable lines).
      include: ["src/**/*.ts"],
      // src/ports/__contracts__/*PortContract.ts are reusable test SUITES (they
      // import describe/it/expect and are run by the *.contract.test.ts files),
      // not production source. vitest only auto-excludes executed *.test.ts
      // files, and v4's default exclude is empty, so exclude the __contracts__
      // convention explicitly — otherwise the broad src/** include counts these
      // test suites as covered source.
      exclude: ["**/__contracts__/**"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
    },
  },
});
