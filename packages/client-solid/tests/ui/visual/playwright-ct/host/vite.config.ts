import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Root is this host dir; @ui-visual resolves to the SAME Solid render target
// as ../../playwright/host/vite.config.ts — only the page-level reset in
// ./main.tsx differs (see ../playwright-ct.config.ts's decision header).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [solid()],
  resolve: {
    alias: {
      "@ui-visual": fileURLToPath(new URL("../../solid", import.meta.url)),
      "@ui-visual-shared": fileURLToPath(
        new URL("../../../../../../ui-contract/src/visual", import.meta.url),
      ),
    },
  },
  server: { host: "127.0.0.1", port: 3400 },
});
