import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Served at /devtools/ from the app's origin in both dev (client-react Vite
  // middleware) and prod (copied into client-react/dist/devtools). Standalone
  // `pnpm dev` (port 5280) is for panel-UI iteration only — BroadcastChannel
  // is same-origin, so a standalone panel shows the disconnected state.
  base: "/devtools/",
  server: { host: "127.0.0.1", port: 5280 },
  build: { outDir: "dist" },
});
