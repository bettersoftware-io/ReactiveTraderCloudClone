import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Package root (packages/client-react) — used to anchor # subpath aliases so
// import.meta.url inside golden/helper modules gets a real filesystem URL.
const pkgRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-contract": fileURLToPath(new URL("./shared", import.meta.url)),
      // Mirror package.json "imports" so that helper/golden modules imported by
      // the harness (e.g. loadGolden, setup utilities) receive a real filesystem
      // import.meta.url rather than a vitest jsdom virtual URL — enabling
      // readFileSync and fileURLToPath to resolve correctly.
      // NOTE: these aliases are for helper/golden modules only. Contract specs
      // must NOT import src/ directly; all src/ access goes through page objects.
      "#/": `${pkgRoot}/src/`,
      "#tests/": `${pkgRoot}/tests/`,
    },
  },
  test: {
    // Pin root to the package dir (THREE levels up from tests/ui/contract) so
    // include/setup/report paths are stable regardless of invocation cwd.
    root: fileURLToPath(new URL("../../..", import.meta.url)),
    environment: "jsdom",
    include: ["tests/ui/contract/specs/**/*.contract.spec.ts"],
    setupFiles: [
      "./tests/setup/jsdom-storage.ts",
      "./tests/ui/contract/react/setup.ts",
    ],
    passWithNoTests: false,
    reporters: ["default", "html"],
    outputFile: { html: "reports/ui/contract/report/index.html" },
    coverage: {
      provider: "v8",
      // Count every src/ui file, even ones no contract spec mounts yet, so the
      // report surfaces wholly-untested files at 0% rather than omitting them.
      include: ["src/ui/**"],
      exclude: [
        // Full-page composition roots — owned by the visual (tests/ui/visual) tier, app/*, + e2e.
        "src/ui/App.tsx",
        "src/ui/credit/CreditWorkspace.tsx",
        // Real composition-root / providers / constants the harness replaces.
        "src/ui/hooks/createViewModel.ts",
        "src/ui/hooks/ViewModelProvider.tsx",
        // The real id→module-root map; the contract/visual harnesses mount a
        // test PanelRegistry instead, exactly like the hooks providers above.
        "src/ui/shell/layout/engine/appPanelRegistry.tsx",
        "src/ui/shell/theme/ThemeProvider.tsx",
        "src/ui/shell/theme/tokens.ts",
        // Canvas/chart leaves with no DOM-assertable logic — owned by the visual tier.
        "src/ui/fx/analytics/PnlChart.tsx",
        // d3 force-layout leaf: aggregation is domain-tested; the rest is
        // imperative d3 DOM (tooltip/tick/exit) exercised by the visual tier.
        "src/ui/fx/analytics/PositionBubbles.tsx",
        "src/ui/fx/liveRates/tile/TileChart.tsx",
        // Equities candlestick canvas leaf (the analog of TileChart): the redraw
        // effect early-returns in jsdom (no 2D context), so its colour-extraction
        // branches only run in the browser tier. The DOM-assertable contract
        // (labelled canvas + NO DATA placeholder) is still exercised by
        // PriceChart.contract.spec.ts; only the canvas internals are excluded.
        "src/ui/equities/chart/PriceChart.tsx",
        // Admin throughput line chart: the canvas draw path (drawLine helper) is
        // unreachable in jsdom (getContext("2d") returns null, early-return).
        // The DOM-assertable contract (wrapper present, NO DATA placeholder) is
        // tested by ThroughputChart.contract.spec.ts; only the canvas internals
        // are excluded, exactly as per the PriceChart / TileChart pattern.
        "src/ui/admin/ThroughputChart.tsx",
        // Complex multi-variant canvas draw functions — no DOM-assertable API;
        // the pixel output is validated by the visual (browser) tier. (jsdom's
        // canvas has no 2D context, so PriceChart's effect early-returns before
        // ever calling drawCandles — it can only run in the browser tier.)
        "src/ui/shell/boot/bootCanvas.ts",
        "src/ui/equities/chart/drawCandles.ts",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/ui/contract/coverage",
    },
  },
});
