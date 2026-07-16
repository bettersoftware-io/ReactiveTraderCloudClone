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

// Every domain is now ported (Tasks 13-16: FX, Credit, Equities, Admin) —
// the full @rtc/ui-contract spec set runs against Solid with nothing
// excluded. The empty list stays (rather than deleting the wiring) so any
// future spec-dir addition has an obvious, pre-plumbed staging mechanism.
const notYetPortedSpecs: string[] = [];

export default defineConfig({
  plugins: [solid()],
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
    exclude: notYetPortedSpecs,
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
        // Full-page composition roots — owned by the visual tier (once it
        // exists) + app/* + e2e, mirrors client-react's exclusion.
        "src/ui/App.tsx",
        "src/ui/shell/theme/ThemeProvider.tsx",
        "src/ui/shell/theme/tokens.ts",
        // Canvas draw path: unreachable in jsdom (getContext("2d") returns
        // null, early-return) — the DOM-assertable chrome is covered by
        // BootSequence.contract.spec.ts; only the canvas internals are
        // excluded, mirroring client-react's bootCanvas.ts exclusion.
        "src/ui/shell/boot/bootCanvas.ts",
        "src/ui/shell/boot/variants/**",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/ui/contract/coverage",
    },
  },
});
