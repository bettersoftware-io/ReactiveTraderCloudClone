import { mergeConfig, defineConfig } from "vitest/config";
import base from "./vitest-browser.config";

// Visual gap-finder: instruments src/ui while the vitest-browser tier renders
// every shared scenario, so UNCOVERED branches = visual states no golden
// captures. Report-only — read the branch/function columns; no threshold gate.
//
// Browser mode requires the istanbul provider (the default v8 provider is not
// supported in browser mode); istanbul also gives truer branch granularity,
// which is exactly what a branch-level gap-finder needs.
//
// Denominator = src/ui minus branchless glue (no conditional render path a
// scenario could miss). Charts and full-page roots (App, Workspace,
// CreditWorkspace, PnlChart, PositionBubbles, PairPnlBars, TileChart) stay IN —
// they are exactly what this tier uniquely renders.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      coverage: {
        provider: "istanbul",
        include: ["src/ui/**"],
        exclude: [
          "src/ui/hooks/HooksProvider.tsx", // pure context provider, no branches
          "src/ui/hooks/createAppHooks.ts", // real presenter wiring; never run in
                                            // the visual tier (renders via
                                            // buildFakeHooks)
          "src/ui/shell/theme/tokens.ts", // CSS-var constants, no logic
          "src/ui/**/*.test.{ts,tsx}", // co-located unit tests; never the SUT
        ],
        reporter: ["text", "html", "lcov"],
        reportsDirectory: "reports/ui/visual/coverage",
      },
    },
  }),
);
