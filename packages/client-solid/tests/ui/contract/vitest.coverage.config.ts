import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, mergeConfig } from "vitest/config";

import base from "./vitest.config";

// Same absolute-path resolution as vitest.config.ts (its node_modules-
// relative `include` glob is filtered by vitest 4's default `test.exclude`
// for **/node_modules/**, verified empirically — see the comment there).
const pkgRoot = fileURLToPath(new URL("../../..", import.meta.url));
const specsDir = resolve(pkgRoot, "../ui-contract/src/specs");

// The coverage gate over the whole src/ui surface. It runs BOTH the neutral
// sociable contract specs AND the co-located src/ui unit tests (hook/util
// edge-cases), so the percentage reflects the true combined coverage of the
// two Phase-2 test styles — not just the contract tier. `test:ui:contract`
// (no coverage) keeps running only the neutral specs. On the CI required
// path since Phase 3 (plan Task 17), next to client-react's identical step.
//
// Thresholds mirror client-react's 95 bar on statements/functions/lines —
// the metrics that map 1:1 to source semantics. BRANCHES are deliberately
// gated lower (85): Solid's compiler emits reactive-effect internals (e.g.
// the `newValue !== cachedValue` guard inside every attribute-update
// effect, the <For>/<Show> fallback checks) whose branches are source-mapped
// onto component lines, inflating v8's branch DENOMINATOR with arms that no
// source-level test can take. Verified concretely on AdminHead.tsx: the
// react build counts 4 branches (both source ternaries, both arms hit); the
// solid build counts 8 for the byte-equivalent JSX, and the only unhit arm
// is a compiled effect guard — while both SOURCE ternaries hit both arms in
// both frameworks. Actual branch coverage at the Phase-3 flip: 89.8%; the
// 85 floor still catches real regressions (a genuinely untested component
// moves statements/lines below 95 first anyway).
export default mergeConfig(
  base,
  defineConfig({
    test: {
      // The co-located src/ui/**/*.test.tsx files (e.g. App.test.tsx) call
      // @solidjs/testing-library's `render()` directly, several times per
      // file, relying on its own auto-registered `afterEach(cleanup)` —
      // which only self-registers when a GLOBAL `afterEach` exists at
      // import time (see client-solid/vitest.config.ts's own comment). The
      // base contract config deliberately leaves `globals` unset so the
      // SAME auto-registration does not ALSO fire for contract specs
      // (which clean up via the harness's own `cleanupMounted()`, called
      // from an explicitly-imported `afterEach`) — doubling up would mean
      // disposing every mounted root twice. Reconciling both styles in one
      // run: `globals: true` here (contract specs still clean up via their
      // own explicit `afterEach`; solid-testing-library's auto-cleanup
      // ALSO fires for them now, but disposing an already-disposed Solid
      // root a second time is a no-op, not an error).
      globals: true,
      include: [
        `${specsDir}/**/*.contract.spec.ts`,
        "src/ui/**/*.test.ts",
        "src/ui/**/*.test.tsx",
      ],
      coverage: {
        thresholds: { statements: 95, branches: 85, functions: 95, lines: 95 },
      },
    },
  }),
);
