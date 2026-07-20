import { defineConfig, mergeConfig } from "vitest/config";

import base from "./vitest-browser.config";

// Visual gap-finder: instruments src/ui while the vitest-browser tier renders
// every shared scenario, so UNCOVERED branches = visual states no golden
// captures. Report-only — read the branch/function columns; no threshold gate.
//
// Browser mode requires the istanbul provider (the default v8 provider is not
// supported in browser mode); istanbul also gives truer branch granularity,
// which is exactly what a branch-level gap-finder needs.
//
// Denominator = presentational components only (src/ui/**/*.tsx). The .tsx-only
// include automatically drops the .ts logic/hook files (csvExport, columnSort,
// filterState, use*.ts, etc.) — those carry no JSX render path a golden could
// capture and are covered by the app / contract tiers. Charts and full-page
// roots (App, Workspace, CreditWorkspace, PnlChart, PositionsPanel,
// PairPnlBars, TileChart) stay IN — they are exactly what this tier uniquely
// renders.
export default mergeConfig(
  base,
  defineConfig({
    define: { __RTC_VISUAL_SKIP_DIFF__: "true" },
    test: {
      coverage: {
        provider: "istanbul",
        include: ["src/ui/**/*.tsx"],
        exclude: [
          "src/ui/**/*.test.{ts,tsx}", // co-located unit tests; never the SUT
        ],
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "reports/ui/visual/coverage",
      },
    },
  }),
);
