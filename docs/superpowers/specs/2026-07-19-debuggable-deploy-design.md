# Fully-debuggable deployed build

**Date:** 2026-07-19
**Status:** Approved (design)
**Builds on:** the `include_sourcemaps` toggle shipped in PRs #281/#284 (see [2026-07-19-unified-deploy-workflow-design.md](2026-07-19-unified-deploy-workflow-design.md)).

## Problem

The `include_sourcemaps` toggle ships a "debuggable" build, but profiling the deployed apps still doesn't resolve to original source. Investigation (2026-07-19) found three distinct causes:

1. **React deploy served no map at all.** The sourcemap and lean builds emit the **identical** Vite content-hashed filename (`index-BEglrBIQ.js`) because Vite hashes chunk *code*, not the appended sourcemap comment. Two different-content files at one URL confuse Vercel's asset caching / deployment-alias promotion, and react's production alias ended up serving a stale no-map bundle. (Confirmed: cache-busted request returned the same no-map etag; `get_project` showed the latest react deployment with `target: null`, i.e. alias/deployment divergence.)
2. **Library frames resolve only to compiled `dist/*.js`, not original `.ts`.** The `@rtc/*` workspace packages are consumed as pre-built `dist/*.js`. They *do* ship `.js.map`, but Vite pre-bundles workspace deps with esbuild, which drops the incoming sourcemap chain — so the trail ends at `dist`. (Solid's live map: 133 app `src/*.tsx` sources resolve to TS; 242 `@rtc` sources stop at `dist/*.js`.) Those `dist` files are `tsc` output (readable, named — not minified), but not the original `.ts`.
3. External `.map` files are 403'd by Vercel's edge (already handled in #284 by using inline maps).

## Goal

An `include_sourcemaps` deploy produces a `rtc-clone-react.vercel.app` / `rtc-clone-solid.vercel.app` where the DevTools flamechart / Sources tab resolves **every** frame — app UI *and* `@rtc/*` libraries — to **original TypeScript** (`.ts`/`.tsx`). The lean (no-map) build remains one un-ticked checkbox away.

## Decisions (locked with user)

- **Toggle on the production URL (not a separate debug URL).** This is a capability-showcase project; shipping a debuggable build to the public URL on demand is acceptable. The user decides per-deploy which build lands (`include_sourcemaps` on/off). Rejected: always-on maps (degrades the live app for all visitors); a separate debug project/preview URL (extra infra / non-fixed URLs).
- **Full resolution, no middle compromise.** The debug build resolves app *and* libraries to original `.ts`. The lean/perf build is always available via the toggle, so there's no reason to bake a half-resolved compromise into the debug variant.

## Non-goals

- No change to the lean (default) production build — same size, same behaviour, no maps.
- No change to the RN client or the server.
- Not making external `.map` served (Vercel 403s them by design; inline stays).

## Design

Three parts, all gated on `RTC_SOURCEMAPS==="1"` (the existing toggle), touching only `packages/client-react/vite.config.ts` and `packages/client-solid/vite.config.ts` (+ a small deploy-workflow confirmation):

### A. Resolve `@rtc/*` from TypeScript source in the debug build

When `RTC_SOURCEMAPS==="1"`, alias each runtime `@rtc/*` package to its `src/index.ts` instead of `dist/index.js`, so Vite/Rollup compiles the libraries from source and the resulting (inline) map points at the original `.ts`. This sidesteps the esbuild-drops-maps problem entirely — there is no pre-built `dist` in the graph to chain from.

- Packages to alias (the runtime deps of the web clients; each has a verified `src/index.ts`): `@rtc/client-core`, `@rtc/domain`, `@rtc/shared`, `@rtc/motion-core`, and the per-client binding (`@rtc/react-bindings` for react, `@rtc/solid-bindings` for solid).
- Mechanism: `resolve.alias` entries (`@rtc/client-core` → `<repo>/packages/client-core/src/index.ts`, etc.), added only when the flag is set. The lean build keeps consuming `dist` unchanged.
- **Known risk — Node subpath imports.** The libs import internally via `"#/*": "./src/*"` (package.json `imports`). When Vite compiles a lib from source, it must resolve `#/…` against *that package's* `package.json`. Vite supports the `imports` field, and resolution is keyed off the nearest `package.json` to each source file, so it should work once the package entry is aliased to `src`. If it doesn't resolve cleanly for a given package, the fallback is explicit per-package `#/` aliases (or a tiny resolver plugin). This is the part implementation must **verify**, not assume.
- **Verification of A:** decode the built inline map and assert `packages/client-core/src/**/*.ts` (and the other libs' `src`) appear in `sources`, and that no `@rtc` `/dist/` paths remain.

### B. Distinct filenames for the debug build (kill the collision)

When `RTC_SOURCEMAPS==="1"`, make the output chunk/entry/asset filenames carry a `dbg` marker (e.g. `assets/[name]-dbg-[hash].js` via `build.rollupOptions.output`), so the debug and lean builds can never produce the same URL for different content. This removes the cache/deployment ambiguity that made react serve a stale bundle, independent of whatever cache-control Vercel applies.

- The lean build keeps today's default naming.
- `index.html` naturally references whichever set the active build produced, so toggling flips the whole set cleanly.

### C. Reliable promotion + guard (deploy workflow)

- Confirm the deploy reliably promotes the chosen build to the production alias (root-cause the `target: null` divergence seen on react; ensure `vercel deploy --prebuilt --prod` aliases as expected — likely fine once B removes the filename collision, but verify on a real deploy).
- Keep the existing post-build inline-sourcemap guard (#284) and the Step-Summary selection panel.

## Verification

1. **Local, per client:** `RTC_SOURCEMAPS=1 pnpm build --filter=@rtc/client-react` → decode the inline map → assert (a) app `src/**/*.tsx` present, (b) `packages/*/src/**/*.ts` present for the aliased libs, (c) no `@rtc` `/dist/` sources, (d) output filenames carry the `dbg` marker. Repeat for solid. Lean build (flag off) → no maps, default filenames.
2. **Live:** trigger `deploy_react` + `include_sourcemaps=true`, re-probe the deployed bundle's inline map for lib `src/*.ts` sources; then a `deploy_react` (flag off) and confirm the prod URL flips back to the lean build cleanly. Repeat for solid.
3. Existing gates (typecheck, biome, e2e/visual unaffected — this only changes debug-build resolution). The lean build output must be byte-unchanged from today (no `dbg` marker, no maps).

## Risks

- **`#/` subpath resolution when compiling libs from source** — the main implementation risk (see A). Mitigated by explicit fallback and mandatory map-decode verification.
- **Debug build correctness drift (source vs dist)** — compiling libs from source could in theory behave subtly differently from the shipped `dist`. Acceptable: the debug build is an on-demand profiling artifact, and source is the more faithful thing to profile. The lean build (unchanged, from `dist`) remains the real production default.
- **Build time** — the debug build compiles the libraries too (slower). Fine for an occasional debug deploy.

## Rollback

Revert the vite.config changes; the lean build path is untouched, so production is unaffected. The toggle simply returns to its #284 behaviour (inline app-only maps).
