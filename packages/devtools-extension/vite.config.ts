import { copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function here(p: string): string {
  return fileURLToPath(new URL(p, import.meta.url));
}

export default defineConfig({
  // React Compiler (ADR-003) — REQUIRED here, not merely nice to have.
  // `@rtc/devtools-app` exports `./src/index.ts`, i.e. raw source, so this
  // build compiles the inspector's components itself rather than consuming a
  // prebuilt bundle. Those components carry no manual memoization (the ban),
  // and rely on the compiler to supply it. Without this preset the extension
  // would ship the SAME source completely unmemoized while the standalone
  // /devtools/ build got the optimized version — a divergence nothing else
  // would surface, since `check:compiler` compiles files in isolation and
  // cannot see which build consumes them.
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    {
      name: "rtc-copy-extension-assets",
      closeBundle(): void {
        copyFileSync(here("manifest.json"), here("dist/manifest.json"));
        copyFileSync(here("devtools.html"), here("dist/devtools.html"));

        // Vite emits the panel.html entry under the source-relative nested
        // path (dist/src/panel/panel.html) because it treats the HTML input
        // as a page, not a flat entry. devtools.panels.create() and the
        // manifest both expect a flat dist/panel.html, so flatten it here.
        // The emitted script/link tags use root-relative paths ("/panel.js",
        // "/assets/...") which resolve correctly from the extension root
        // regardless of the copy's destination.
        copyFileSync(
          here("dist/src/panel/panel.html"),
          here("dist/panel.html"),
        );
        rmSync(here("dist/src"), { recursive: true, force: true });
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: here("src/background.ts"),
        contentBridge: here("src/contentBridge.ts"),
        devtools: here("src/devtools.ts"),
        panel: here("src/panel/panel.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
