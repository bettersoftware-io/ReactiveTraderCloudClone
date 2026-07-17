import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Root is this host dir; @ui-visual resolves to the Solid render target two
// levels up — the framework-swap seam, react's host points this alias at
// ../../react instead.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [solid()],
  resolve: {
    alias: {
      "@ui-visual": fileURLToPath(new URL("../../solid", import.meta.url)),
      // The shared scenario/goldenPath matrix (@rtc/ui-contract) —
      // VisualScenario.tsx (behind @ui-visual above) imports it.
      "@ui-visual-shared": fileURLToPath(
        new URL("../../../../../../ui-contract/src/visual", import.meta.url),
      ),
    },
  },
  server: { host: "127.0.0.1", port: 3300 },
});
