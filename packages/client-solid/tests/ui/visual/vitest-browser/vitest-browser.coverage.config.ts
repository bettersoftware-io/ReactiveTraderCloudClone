import { defineConfig, mergeConfig } from "vitest/config";

import base from "./vitest-browser.config";

// Visual gap-finder for client-solid — the twin of client-react's tier of the
// same name. It instruments src/ui while rendering every shared scenario, so
// UNCOVERED code = visual states no golden captures. Report-only; no gate.
//
// Why this exists even though the scenario MATRIX is shared with react: the
// matrix tells you which states are snapshotted, but not which code each
// client runs to produce them. Solid-only code — the compiled reactive-effect
// guards, and hooks with no react counterpart such as useNewestOrderId /
// useTickFlash — is measured by nothing else, since the contract tier's
// denominator is behaviour-shaped rather than render-shaped. Where the two
// clients' numbers DIVERGE is the interesting signal: same scenarios, so a gap
// on one side only means that client has a render path the other lacks.
//
// Browser mode requires the istanbul provider (v8 is unsupported there), which
// also gives the truer branch granularity a gap-finder wants.
//
// Denominator = presentational components only (src/ui/**/*.tsx), matching
// react's: the .tsx-only include drops .ts logic/hook files, which carry no
// JSX render path a golden could capture and are covered by the app/contract
// tiers instead.
export default mergeConfig(
  base,
  defineConfig({
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
