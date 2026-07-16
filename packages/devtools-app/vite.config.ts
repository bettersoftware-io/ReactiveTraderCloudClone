import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // React Compiler auto-memoizes components (ADR-003), so the inspector's rows
  // — now identity-stable from InspectorStore — skip re-render when their props
  // are referentially equal. No manual React.memo. On React 19 the compiler
  // emits `react/compiler-runtime`; no extra runtime package needed.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  // Served at /devtools/ from the app's origin in both dev (client-react Vite
  // middleware) and prod (copied into client-react/dist/devtools). Standalone
  // `pnpm dev` (port 5280) is for panel-UI iteration only — BroadcastChannel
  // is same-origin, so a standalone panel shows the disconnected state.
  base: "/devtools/",
  server: { host: "127.0.0.1", port: 5280 },
  build: { outDir: "dist" },
});
