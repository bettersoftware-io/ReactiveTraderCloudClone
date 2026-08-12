import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

// Package root (packages/client-solid) — used to anchor # subpath aliases so
// import.meta.url inside golden/helper modules gets a real filesystem URL.
const pkgRoot = fileURLToPath(new URL("../../..", import.meta.url));

// Specs live in @rtc/ui-contract. vitest 4's default `test.exclude` always
// drops anything matching `**/node_modules/**`, which wins over a matching
// `include` glob — so the node_modules workspace-symlink form
// (`node_modules/@rtc/ui-contract/src/specs/**`) is silently filtered out
// ("No test files found"), verified empirically in client-react's own config
// (same comment there). An absolute path built with path.resolve that walks
// the real sibling-package directory directly (never touching the
// node_modules symlink) sidesteps that exclude entirely.
const specsDir = resolve(pkgRoot, "../ui-contract/src/specs");

export default defineConfig({
  // hot: false (Task 12/P5) — vite-plugin-solid enables solid-refresh HMR
  // wrapping whenever `command === "serve"`, which vitest's own dev server
  // always reports true for, even under a one-shot `vitest run`; harmless
  // until the new `AppShell` token (`registry.tsx`) made App.tsx (and
  // therefore every panel it reaches) part of setup.ts's eagerly-loaded
  // module graph for every test in this project, INCLUDING the co-located
  // `appPanelRegistry.test.ts`/`appHeadRegistry.test.ts` unit tests: those
  // mock `createComponent` to assert panel-id→module identity WITHOUT
  // rendering, and solid-refresh's extra memo/untrack wrapper around each
  // now-HMR-registered leaf broke that interception (the mock stopped
  // firing, so the real component body ran — `useViewModel()` outside any
  // `ViewModelProvider`, `useViewModel must be used within ViewModelProvider`).
  // HMR has no meaning inside a one-shot test run, so disabling it outright
  // is the correct fix, not a workaround for the mock specifically.
  plugins: [solid({ hot: false })],
  resolve: {
    alias: {
      // The framework-neutral harness lives in @rtc/ui-contract; resolve
      // through the workspace symlink (node_modules), not a deep relative
      // path, so this stays a package-name import (Biome bans ≥2-up
      // relative imports in source; config files are exempt but consistency
      // matters — mirrors client-react's tests/ui/contract/vitest.config.ts).
      "@ui-contract": fileURLToPath(
        new URL(
          "../../../node_modules/@rtc/ui-contract/src/shared",
          import.meta.url,
        ),
      ),
      // Mirror package.json "imports" so that helper/golden modules imported
      // by the harness (e.g. loadGolden, setup utilities) receive a real
      // filesystem import.meta.url rather than a vitest jsdom virtual URL —
      // enabling readFileSync and fileURLToPath to resolve correctly.
      // NOTE: these aliases are for helper/golden modules only. Contract
      // specs must NOT import src/ directly; all src/ access goes through
      // page objects.
      "#/": `${pkgRoot}/src/`,
      "#tests/": `${pkgRoot}/tests/`,
    },
  },
  test: {
    // Pin root to the package dir (THREE levels up from tests/ui/contract)
    // so include/setup/report paths are stable regardless of invocation cwd.
    root: fileURLToPath(new URL("../../..", import.meta.url)),
    environment: "jsdom",
    include: [`${specsDir}/**/*.contract.spec.ts`],
    setupFiles: [
      "./tests/setup/jsdom-storage.ts",
      "./tests/ui/contract/solid/setup.ts",
    ],
    passWithNoTests: false,
    reporters: ["default", "html"],
    outputFile: { html: "reports/ui/contract/report/index.html" },
    coverage: {
      provider: "v8",
      // Count every src/ui file, even ones no contract spec mounts yet, so
      // the report surfaces wholly-untested files at 0% rather than
      // omitting them.
      include: ["src/ui/**"],
      exclude: [
        // App.tsx used to be a full-page composition root the contract tier
        // never mounted (owned instead by the visual tier + app/* + e2e,
        // mirrored client-react's own exclusion) — no longer true as of
        // Task 12/P5's `AppShell` (JarvisDriver.contract.spec.ts +
        // HeaderChrome.contract.spec.ts's promotion regression), which
        // mounts the REAL `App` to witness the driven-pulse cue on the nav
        // rail + workspace wrapper together, so it now participates in this
        // gate for real (mirrors client-react's own un-exclusion).
        "src/ui/shell/theme/ThemeProvider.tsx",
        "src/ui/shell/theme/tokens.ts",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/ui/contract/coverage",
    },
  },
});
