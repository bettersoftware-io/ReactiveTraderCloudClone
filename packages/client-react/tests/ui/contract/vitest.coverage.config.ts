import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// The coverage gate over the whole src/ui surface. It runs BOTH the neutral
// sociable contract specs AND the co-located src/ui unit tests (hook/util
// edge-cases), so the percentage reflects the true combined coverage of the
// two Phase-2 test styles — not just the contract tier. `test:ui:contract`
// (no coverage) keeps running only the neutral specs.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: [
        "tests/ui/contract/specs/**/*.contract.spec.ts",
        "src/ui/**/*.test.ts",
        "src/ui/**/*.test.tsx",
      ],
      coverage: {
        thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
      },
    },
  }),
);
