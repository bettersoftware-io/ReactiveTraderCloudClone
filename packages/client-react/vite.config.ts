import { cpSync, createReadStream, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import {
  defineConfig,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from "vite";

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

  // The build's resolved output directory (Vite's own `--outDir`/config
  // default, not the hardcoded "dist" literal) — read once configResolved
  // fires, so closeBundle copies devtools alongside wherever this build
  // actually wrote its output (e.g. check-core-bundle.mts's per-core temp
  // dirs), never a stale "dist" sibling.
  let outDir = "dist";

  return {
    name: "rtc-devtools-panel",
    configResolved(config: ResolvedConfig): void {
      outDir = config.build.outDir;
    },
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
        cpSync(appDist, join(outDir, "devtools"), { recursive: true });
      }
    },
  };
}

// When the Deploy workflow requests a debuggable build (RTC_SOURCEMAPS=1),
// resolve the @rtc/* workspace libraries from their TypeScript SOURCE instead of
// their prebuilt dist/*.js, so Vite compiles them into the bundle and the inline
// map points at the original .ts. Consuming dist breaks the map chain (Vite's
// esbuild dep pre-bundle drops the libs' own .js.map). Empty in a lean build, so
// production output is unchanged. See docs/superpowers/specs/2026-07-19-debuggable-deploy-design.md.
const debugBuild = process.env.RTC_SOURCEMAPS === "1";

function pkgSrc(name: string): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    name,
    "src",
    "index.ts",
  );
}

// Bare package specifiers only. Every @rtc/* package currently exports just "."
// (imported as `@rtc/client-adapters`, never `@rtc/client-adapters/sub`), so mapping the
// specifier straight to src/index.ts is correct. If a production `src` file ever
// adds an `@rtc/*/subpath` import, add its own alias entry — a prefix match would
// otherwise rewrite it to `.../src/index.ts/subpath` and break the debug build.
// @rtc/layout-dockview also has a `./styles/*` subpath export (mirrors
// @rtc/boot-splash), and — like boot-splash — its bare specifier IS mapped below (the debug build
// needs its source). Vite's string alias keys match at `/` boundaries, so the
// bare entry alone would rewrite `@rtc/layout-dockview/styles/dockview-hud.css`
// to `.../src/index.ts/styles/...` (ENOTDIR — broke the 2026-08-12 deploy).
// The longer `/styles` key below is listed FIRST so it wins the prefix match.
const rtcSourceAlias: Record<string, string> = debugBuild
  ? {
      "@rtc/layout-dockview/styles": resolve(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "layout-dockview",
        "src",
        "styles",
      ),
      // Same subpath shape as layout-dockview above: `./styles/*` CSS Modules,
      // so its `/styles` key must precede the bare one.
      "@rtc/boot-splash/styles": resolve(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "boot-splash",
        "src",
        "styles",
      ),
      "@rtc/boot-splash": pkgSrc("boot-splash"),
      "@rtc/web-boot": pkgSrc("web-boot"),
      "@rtc/client-core-async": pkgSrc("client-core-async"),
      "@rtc/client-core-effect": pkgSrc("client-core-effect"),
      "@rtc/client-core-rxjs": pkgSrc("client-core-rxjs"),
      "@rtc/client-adapters": pkgSrc("client-adapters"),
      "@rtc/core-api": pkgSrc("core-api"),
      "@rtc/core-logic": pkgSrc("core-logic"),
      "@rtc/domain": pkgSrc("domain"),
      "@rtc/shared": pkgSrc("shared"),
      "@rtc/motion-core": pkgSrc("motion-core"),
      "@rtc/devtools-core": pkgSrc("devtools-core"),
      "@rtc/react-bindings": pkgSrc("react-bindings"),
      "@rtc/layout-dockview": pkgSrc("layout-dockview"),
    }
  : {};

// The e2e harness sets RTC_LEAN_DEPS=1 on every dev server it starts
// (tests/scripts/devServer.ts, tests/fullstack/_orchestration.ts): pre-bundled
// dependencies are then served minified and without a source map. Each e2e
// test opens a fresh browser context, so every test re-downloads every
// dependency, and Vite appends each one's source map inline to the response —
// `effect` alone was 11 MB per page load (3.3 MB of code + its map), the main
// reason the effect-core e2e job ran ~1.65x the default one. Measured 2026-10-04 on
// 16 tests with tracing on: 36 s at 11 MB, 30.5 s without the map, 28.3 s
// minified too, against 26.5 s for the RxJS core. Unset (plain `pnpm dev`),
// nothing changes: dependencies keep their source maps for debugging.
const leanDeps = process.env.RTC_LEAN_DEPS === "1";

/** A transform answer that tells Vite "this module has no source map". */
interface MaplessCode {
  readonly code: string;
  readonly map: { readonly mappings: "" };
}

/** Serve Vite's pre-bundled dependencies without a source map. `mappings: ""`
 * is the plugin API's "no source map" answer; Vite's dep optimizer hard-codes
 * `sourcemap: "hidden"`, and deleting the `.map` file makes Vite generate a
 * larger fallback map instead (18 MB for `effect`), so this is the one way
 * to drop it. The appended newline is load-bearing: Vite keeps the map it
 * loaded whenever the transform pipeline leaves the code byte-identical, which
 * is the case for a dependency with no imports to rewrite (dockview, motion).
 * `assertDepsServedLean` (tests/scripts/lib/leanDeps.ts) fails the e2e run if
 * a Vite upgrade stops honouring any of this. */
function dropDepSourcemaps(): Plugin {
  return {
    name: "rtc-drop-dep-sourcemaps",
    apply: "serve",
    transform(code: string, id: string): MaplessCode | null {
      if (!id.includes("/.vite/deps/")) {
        return null;
      }

      return { code: `${code}\n`, map: { mappings: "" } };
    },
  };
}

export default defineConfig({
  // VITE_CORE_IMPL sets this build's DEFAULT application core (see
  // packages/web-boot/src/coreSelection.ts's resolveCoreChoice, which ranks `?core=` and
  // the stored choice above this build default, itself above "rxjs"). All
  // three cores ship in every build, each a dynamic import `loadCore`
  // fetches lazily once chosen (RxJS included, from its own package,
  // `@rtc/client-core-rxjs`), so this no longer selects what gets
  // bundled (see `pnpm check:core-bundle`). Vite's built-in
  // import.meta.env replacement leaves the value as whatever string ran the
  // process, so `define` re-inlines it as a JSON string literal `bootApp.ts`
  // reads through `import.meta.env.VITE_CORE_IMPL`. Unset → "rxjs".
  define: {
    "import.meta.env.VITE_CORE_IMPL": JSON.stringify(
      process.env.VITE_CORE_IMPL || "rxjs",
    ),
  },
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
    ...(leanDeps ? [dropDepSourcemaps()] : []),
  ],
  resolve: { alias: rtcSourceAlias },
  optimizeDeps: leanDeps
    ? { rolldownOptions: { output: { minify: true } } }
    : {},
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
    // passes it through). "inline" (not external): Vercel's edge 403s served
    // .map files, so an external map is generated + linked but never fetchable;
    // an inline data: URI has no separate request to block. See docs/DEPLOY.md.
    sourcemap: debugBuild ? "inline" : false,
    rolldownOptions: {
      // Two real pages: the app and the dockview pop-out target. The popout
      // page ships EMPTY (dockview appends its container and copies the
      // parent's stylesheets after `load`); it exists so the child window
      // stops falling back to the SPA (which booted the whole app under
      // dockview's container) and so the deployed site serves a real file —
      // Vercel routing is filesystem-first, so dist/popout.html wins over
      // the SPA rewrite with no vercel config change.
      input: {
        index: fileURLToPath(new URL("index.html", import.meta.url)),
        popout: fileURLToPath(new URL("popout.html", import.meta.url)),
      },
      output: {
        // React DevTools names components from each function's runtime `.name`
        // / `displayName`, not from sourcemaps — so a minified deploy shows
        // `Ph`/`qd` in the component tree even when inline maps are shipped.
        // keepNames makes the bundler re-attach the original name after Oxc's
        // identifier mangling; identifiers stay shortened, only `.name`
        // survives. Debug builds only: it costs ~7% gzip (measured at
        // adoption), so the lean deploy stays name-mangled and byte-identical
        // to a pre-keepNames build — full DevTools names ride the same
        // include_sourcemaps deploy flag as the inline maps. Must live HERE:
        // this Vite is rolldown-based, where the classic
        // `esbuild: { keepNames: true }` knob is a silent no-op (the only
        // esbuild→rolldown compat mapping is for optimizeDeps).
        keepNames: debugBuild,
        // Debug builds emit distinct `-dbg-` filenames so the sourcemap build
        // and the lean build can never collide at the same hashed URL (Vite
        // hashes code, not the appended map) — which previously let a stale
        // lean bundle serve in place of a sourcemap deploy. Lean build keeps
        // Vite's default names.
        ...(debugBuild
          ? {
              entryFileNames: "assets/[name]-dbg-[hash].js",
              chunkFileNames: "assets/[name]-dbg-[hash].js",
              assetFileNames: "assets/[name]-dbg-[hash][extname]",
            }
          : {}),
      },
    },
  },
});
