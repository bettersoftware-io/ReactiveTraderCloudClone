import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-contract": fileURLToPath(new URL("./shared", import.meta.url)),
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
        "src/ui/shell/layout/Workspace.tsx",
        "src/ui/credit/CreditWorkspace.tsx",
        // Real composition-root / providers / constants the harness replaces.
        "src/ui/hooks/createAppHooks.ts",
        "src/ui/hooks/HooksProvider.tsx",
        "src/ui/shell/theme/ThemeProvider.tsx",
        "src/ui/shell/theme/tokens.ts",
        // Canvas/chart leaves with no DOM-assertable logic — owned by the visual tier.
        "src/ui/fx/analytics/PnlChart.tsx",
        "src/ui/fx/analytics/PositionBubbles.tsx",
        "src/ui/fx/analytics/PairPnlBars.tsx",
        "src/ui/fx/liveRates/tile/TileChart.tsx",
      ],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/ui/contract/coverage",
    },
  },
});
