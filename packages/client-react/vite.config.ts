import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // React Compiler auto-memoizes components and hooks at build time, making
  // manual useMemo/useCallback redundant (see docs/adr/ADR-003). @vitejs/
  // plugin-react v6 is oxc-based and has no `babel` option, so the compiler
  // runs through @rolldown/plugin-babel via the plugin's reactCompilerPreset
  // helper. On React 19 it emits `react/compiler-runtime` — no extra runtime
  // package needed.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
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
