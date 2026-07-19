import { cpSync, createReadStream, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

/** Serve the built `@rtc/devtools-app` inspector at /devtools/ in dev (Vite
 * middleware) and copy it into dist/devtools at build time. Same-origin is
 * load-bearing: the devtools BroadcastChannel cannot cross origins, so the
 * inspector can only pair with the app's hub when served from this origin.
 * Requires @rtc/devtools-app to be built first — the devDependency gives
 * turbo the topological build edge, so `pnpm build`/`pnpm dev` order it
 * correctly. The devtools-app is built with `base: "/devtools/"`, so its
 * index.html references absolute `/devtools/assets/*` URLs that this same
 * middleware serves. Dependency-free: node:fs/node:path/node:module only. */
function devtoolsPanel(): Plugin {
  const require = createRequire(import.meta.url);
  // Resolve the workspace package root without importing its source (dep-cruiser
  // forbids a source import; this is a build-order + dist-path edge only).
  // @rtc/devtools-app's `exports` map includes a "./package.json": "./package.json"
  // self-entry specifically so this deep-resolve keeps working — don't remove it
  // from devtools-app's package.json or this require.resolve breaks.
  const appDist = join(
    dirname(require.resolve("@rtc/devtools-app/package.json")),
    "dist",
  );

  function contentType(file: string): string {
    if (file.endsWith(".html")) {
      return "text/html";
    }

    if (file.endsWith(".js")) {
      return "text/javascript";
    }

    if (file.endsWith(".css")) {
      return "text/css";
    }

    if (file.endsWith(".svg")) {
      return "image/svg+xml";
    }

    return "application/octet-stream";
  }

  return {
    name: "rtc-devtools-panel",
    configureServer(server: ViteDevServer): void {
      server.middlewares.use("/devtools", (req, res, next): void => {
        // Connect strips the "/devtools" mount prefix from req.url, so "/" here
        // maps to the built index.html and "/assets/x.js" to that asset.
        const url = (req.url ?? "/").split("?")[0];
        // Leading "." keeps the joined path relative before resolve() collapses
        // any ".." segments — resolve() (unlike join()) is then verified below
        // to stay within appDist, so a crafted "/devtools/../../etc/passwd"
        // request can't escape the served directory.
        const rel = url === "/" ? "index.html" : `.${url}`;
        const file = resolve(appDist, rel);

        if (
          (file === appDist || file.startsWith(appDist + sep)) &&
          existsSync(file) &&
          !file.endsWith(sep)
        ) {
          res.setHeader("content-type", contentType(file));
          createReadStream(file).pipe(res);
          return;
        }

        next();
      });
    },
    closeBundle(): void {
      if (existsSync(appDist)) {
        cpSync(appDist, join("dist", "devtools"), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  // React Compiler auto-memoizes components and hooks at build time, making
  // manual useMemo/useCallback redundant (see docs/adr/ADR-003). @vitejs/
  // plugin-react v6 is oxc-based and has no `babel` option, so the compiler
  // runs through @rolldown/plugin-babel via the plugin's reactCompilerPreset
  // helper. On React 19 it emits `react/compiler-runtime` — no extra runtime
  // package needed.
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    devtoolsPanel(),
  ],
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
    // On-demand debuggable production build: the Deploy workflow sets
    // RTC_SOURCEMAPS=1 (declared in turbo.json build.env so strict-mode Turbo
    // passes it through) so a profiled deploy shows real component names in the
    // flamechart. Unset/"" → false, i.e. today's minified build.
    sourcemap: process.env.RTC_SOURCEMAPS === "1",
  },
});
