import { cpSync, createReadStream, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";

import devtools from "solid-devtools/vite";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import solid from "vite-plugin-solid";

/** Serve the built `@rtc/devtools-app` inspector at /devtools/ in dev (Vite
 * middleware) and copy it into dist/devtools at build time. Same-origin is
 * load-bearing: the devtools BroadcastChannel cannot cross origins, so the
 * inspector can only pair with the app's hub when served from this origin.
 * Requires @rtc/devtools-app to be built first — the devDependency gives turbo
 * the topological build edge. Verbatim port of client-react's devtoolsPanel().
 * Dependency-free: node:fs/node:path/node:module only. */
function devtoolsPanel(): Plugin {
  const require = createRequire(import.meta.url);
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
        const url = (req.url ?? "/").split("?")[0];
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
  // solid-devtools must precede vite-plugin-solid (its own docs say so): it
  // needs to see + transform source before the solid compiler runs. Dev-only —
  // the plugin's `apply()` gate skips it for `vite build` / production mode.
  plugins: [devtools({ autoname: true }), solid(), devtoolsPanel()],
  server: {
    host: "127.0.0.1",
    // PORT is the PREFERRED port; Vite auto-increments to the next free one if
    // it's taken. Plain `pnpm dev` (no PORT) defaults to 5473 — the client-solid
    // dev port (client-react's is 5173, client-prototype's is 5273).
    port: parseInt(process.env.PORT || "5473", 10),
  },
  build: {
    outDir: "dist",
  },
});
