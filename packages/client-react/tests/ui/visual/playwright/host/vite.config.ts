import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Root is this host dir; @ui-visual resolves to the React render target two
// levels up. A Solid host would point the alias at ../../solid instead.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-visual": fileURLToPath(new URL("../../react", import.meta.url)),
    },
  },
  server: { host: "127.0.0.1", port: 3200 },
});
