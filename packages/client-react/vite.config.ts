import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    // PORT is the PREFERRED port; Vite auto-increments to the next free one if
    // it's taken. The e2e harness (tests/scripts/devServer.ts) parses the actual
    // bound port from Vite's output, so drifting is fine and race-free across
    // parallel runners. Plain `pnpm dev` (no PORT) defaults to 5173.
    port: parseInt(process.env.PORT || "5173", 10),
  },
  build: {
    outDir: "dist",
  },
});
