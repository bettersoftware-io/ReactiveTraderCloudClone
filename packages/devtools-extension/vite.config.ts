import { copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function here(p: string): string {
  return fileURLToPath(new URL(p, import.meta.url));
}

export default defineConfig({
  plugins: [
    react(),
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
