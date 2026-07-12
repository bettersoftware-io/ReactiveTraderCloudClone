import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Root is this host dir; @ui-visual resolves to the React render target two
// levels up. A Solid host would point the alias at ../../solid instead.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-visual": fileURLToPath(new URL("../../react", import.meta.url)),
      // The shared scenario/goldenPath matrix (@rtc/ui-contract, Task 3) —
      // VisualScenario.tsx (behind @ui-visual above) imports it.
      "@ui-visual-shared": fileURLToPath(
        new URL("../../../../../../ui-contract/src/visual", import.meta.url),
      ),
    },
  },
  server: { host: "127.0.0.1", port: 3200 },
});
