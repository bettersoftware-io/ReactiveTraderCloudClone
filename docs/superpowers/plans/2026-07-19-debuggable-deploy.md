# Fully-debuggable Deployed Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `RTC_SOURCEMAPS=1`, the web-client debug build resolves the flamechart to original TypeScript for the app **and** the `@rtc/*` libraries, and emits distinct `-dbg-` filenames so it can never collide with the lean build's cached assets.

**Architecture:** In each client's `vite.config.ts`, gate two things on `RTC_SOURCEMAPS==="1"`: (1) `resolve.alias` entries pointing every runtime `@rtc/*` package at its `src/index.ts` (so Vite compiles the libs from source and the inline map targets `.ts`, sidestepping the esbuild-drops-dist-maps problem); (2) `-dbg-` output filenames. The lean build is untouched (empty alias map, default filenames, no maps).

**Tech Stack:** Vite (`resolve.alias`, `build.rollupOptions.output`), Node subpath imports (`#/*`), pnpm workspaces.

Spec: [../specs/2026-07-19-debuggable-deploy-design.md](../specs/2026-07-19-debuggable-deploy-design.md)

## Global Constraints

- **Only the debug build changes.** Everything is gated on `process.env.RTC_SOURCEMAPS === "1"`. With the flag off, the config must be behaviourally identical to today: no maps, Vite's default `assets/[name]-[hash].js` names, `dist` (not `src`) for `@rtc/*`.
- **`RTC_SOURCEMAPS` convention:** `"1"` = debug build; unset/empty = lean.
- **Aliased `@rtc/*` runtime packages** (each has a verified `src/index.ts`): `client-core`, `domain`, `shared`, `motion-core`, `devtools-core`, plus the per-client binding (`react-bindings` for react, `solid-bindings` for solid). The map-decode verification is the source of truth — if it shows any `@rtc` `/dist/` source, add that package to the alias map.
- **Node subpath imports:** the libs import internally via `"#/*": "./src/*"` (package.json `imports`). Vite resolves this per-package from the nearest `package.json`; the map-decode check proves it worked. If a package fails to resolve `#/…`, add an explicit alias for it (fallback).
- **Pinned tooling / no new deps.** Use existing `node:path`/`node:url` only.
- **Commit trailer (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FSBT2hKxdjSPc1dY1tTxux
  ```
- **Gates:** `pnpm typecheck` (both clients) + `biome ci` on the changed configs must stay green.

## Shared verification tool (used by Tasks 1 & 2)

Write this once to the scratchpad (NOT committed) and reuse it in both tasks' verification:

`/private/tmp/claude-501/-Users-csx-workarea-dev-github-com-bettersoftware-io-ReactiveTraderCloudClone/2cbd1e91-0e5e-4e50-b65c-1c516d751b28/scratchpad/check-localmap.mjs`

```js
// Usage: node check-localmap.mjs <dist-dir>
// Decodes the inline sourcemap of the entry bundle and reports source resolution.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const dist = process.argv[2];
const assets = join(dist, "assets");
const js = readdirSync(assets).filter((f) => f.endsWith(".js"));
let total = { app: 0, rtcSrc: 0, rtcDist: 0, nm: 0 };
let dbgNames = 0;
for (const f of js) {
  if (f.includes("-dbg-")) dbgNames++;
  const code = readFileSync(join(assets, f), "utf8");
  const m = code.match(/sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)/);
  if (!m) continue;
  const map = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
  for (const s of map.sources || []) {
    if (s.includes("node_modules")) total.nm++;
    else if (/packages\/[^/]+\/dist\//.test(s) || /\/(client-core|domain|shared|motion-core|devtools-core|react-bindings|solid-bindings)\/dist\//.test(s)) total.rtcDist++;
    else if (/packages\/[^/]+\/src\//.test(s) || /\/(client-core|domain|shared|motion-core|devtools-core|react-bindings|solid-bindings)\/src\//.test(s)) total.rtcSrc++;
    else if (/\/src\/.*\.(tsx?|jsx?)$/.test(s)) total.app++;
  }
}
console.log(JSON.stringify({ jsFiles: js.length, dbgNamedFiles: dbgNames, ...total }, null, 2));
```

---

### Task 1: React debug build → source resolution + `-dbg-` filenames

**Files:**
- Modify: `packages/client-react/vite.config.ts` (add a `node:url` import, a module-level debug block before `export default defineConfig`, a `resolve` key, and conditional `build.rollupOptions.output`).

**Interfaces:**
- Consumes: `RTC_SOURCEMAPS` env (existing).
- Produces: nothing other tasks import; Task 2 mirrors this shape.

- [ ] **Step 1: Baseline — capture today's lean output names (for the byte-identity check later)**

Run:
```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
pnpm build --filter=@rtc/client-react >/dev/null 2>&1 && ls packages/client-react/dist/assets/ | sed -E 's/-[A-Za-z0-9_]+\././' | sort -u
```
Expected: names like `index-.js`, `index-.css` (no `-dbg-`). Note them.

- [ ] **Step 2: Add the `node:url` import**

In `packages/client-react/vite.config.ts`, change:
```ts
import { dirname, join, resolve, sep } from "node:path";
```
to add a second import line right after it:
```ts
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
```

- [ ] **Step 3: Add the module-level debug block**

In `packages/client-react/vite.config.ts`, immediately BEFORE `export default defineConfig({`, insert:
```ts
// When the Deploy workflow requests a debuggable build (RTC_SOURCEMAPS=1),
// resolve the @rtc/* workspace libraries from their TypeScript SOURCE instead of
// their prebuilt dist/*.js, so Vite compiles them into the bundle and the inline
// map points at the original .ts. Consuming dist breaks the map chain (Vite's
// esbuild dep pre-bundle drops the libs' own .js.map). Empty in a lean build, so
// production output is unchanged. See docs/superpowers/specs/2026-07-19-debuggable-deploy-design.md.
const debugBuild = process.env.RTC_SOURCEMAPS === "1";
const pkgSrc = (name: string): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), "..", name, "src", "index.ts");
const rtcSourceAlias: Record<string, string> = debugBuild
  ? {
      "@rtc/client-core": pkgSrc("client-core"),
      "@rtc/domain": pkgSrc("domain"),
      "@rtc/shared": pkgSrc("shared"),
      "@rtc/motion-core": pkgSrc("motion-core"),
      "@rtc/devtools-core": pkgSrc("devtools-core"),
      "@rtc/react-bindings": pkgSrc("react-bindings"),
    }
  : {};
```

- [ ] **Step 4: Add the `resolve` key**

In `packages/client-react/vite.config.ts`, inside the `defineConfig({ ... })` object, add a `resolve` key right after the `plugins: [...]` array (before `server:`):
```ts
  resolve: { alias: rtcSourceAlias },
```

- [ ] **Step 5: Add conditional `-dbg-` output filenames**

In `packages/client-react/vite.config.ts`, replace the whole `build: { ... }` block with:
```ts
  build: {
    outDir: "dist",
    // On-demand debuggable production build: the Deploy workflow sets
    // RTC_SOURCEMAPS=1 (declared in turbo.json build.env so strict-mode Turbo
    // passes it through). "inline" (not external): Vercel's edge 403s served
    // .map files, so an external map is generated + linked but never fetchable;
    // an inline data: URI has no separate request to block. See docs/DEPLOY.md.
    sourcemap: debugBuild ? "inline" : false,
    // Debug builds emit distinct `-dbg-` filenames so the sourcemap build and the
    // lean build can never collide at the same hashed URL (Vite hashes code, not
    // the appended map) — which previously let a stale lean bundle serve in place
    // of a sourcemap deploy. Lean build keeps Vite's default names.
    ...(debugBuild
      ? {
          rollupOptions: {
            output: {
              entryFileNames: "assets/[name]-dbg-[hash].js",
              chunkFileNames: "assets/[name]-dbg-[hash].js",
              assetFileNames: "assets/[name]-dbg-[hash][extname]",
            },
          },
        }
      : {}),
  },
```

- [ ] **Step 6: Write the shared verification tool** (from "Shared verification tool" above) to the scratchpad path.

- [ ] **Step 7: Build the debug variant and verify source resolution + filenames**

Run:
```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
RTC_SOURCEMAPS=1 pnpm build --filter=@rtc/client-react --force
node /private/tmp/claude-501/-Users-csx-workarea-dev-github-com-bettersoftware-io-ReactiveTraderCloudClone/2cbd1e91-0e5e-4e50-b65c-1c516d751b28/scratchpad/check-localmap.mjs packages/client-react/dist
```
Expected: build succeeds; JSON shows `dbgNamedFiles` = `jsFiles` (all `-dbg-`), `app` > 0, `rtcSrc` > 0, and **`rtcDist` = 0**. If `rtcDist` > 0, an `@rtc` package resolved to dist — add it to `rtcSourceAlias` and re-run. If the build errors on a `#/…` import, add an explicit alias for that package's subpath and re-run.

- [ ] **Step 8: Verify the debug build actually serves (not broken by source compilation)**

Run:
```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy/packages/client-react
(pnpm exec vite preview --port 4999 >/tmp/vprev.log 2>&1 &) ; sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4999/)
js=$(curl -s http://127.0.0.1:4999/ | grep -oE '/assets/[^"]+-dbg-[^"]+\.js' | head -1)
jscode=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:4999$js")
echo "index=$code  jsbundle=$js -> $jscode"
pkill -f "vite preview --port 4999" || true
```
Expected: `index=200`, a `-dbg-` JS path, `-> 200`. (Confirms the source-compiled debug build boots and serves.)

- [ ] **Step 9: Verify the LEAN build is unchanged**

Run:
```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
pnpm build --filter=@rtc/client-react --force
ls packages/client-react/dist/assets/ | grep -c -- "-dbg-" | xargs echo "dbg files in lean build (want 0):"
grep -rl "sourceMappingURL" packages/client-react/dist/assets/ 2>/dev/null | wc -l | xargs echo "mapped files in lean build (want 0):"
```
Expected: both 0.

- [ ] **Step 10: Typecheck + lint**

Run:
```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
pnpm typecheck --filter=@rtc/client-react
npx @biomejs/biome ci packages/client-react/vite.config.ts
```
Expected: both clean.

- [ ] **Step 11: Commit**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
git add packages/client-react/vite.config.ts
git commit -m "$(cat <<'EOF'
feat(client-react): resolve @rtc libs from source + -dbg- filenames in debug build

When RTC_SOURCEMAPS=1, alias @rtc/* runtime packages to their src/index.ts so
Vite compiles them from source and the inline map resolves to original .ts (not
prebuilt dist/*.js), and emit distinct -dbg- filenames so the debug and lean
builds can never collide at the same hashed URL. Lean build unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FSBT2hKxdjSPc1dY1tTxux
EOF
)"
```

---

### Task 2: Solid debug build → source resolution + `-dbg-` filenames

Mirror of Task 1 for `packages/client-solid/vite.config.ts`. Separate task: solid uses `vite-plugin-solid` + `solid-devtools`, so it verifies independently.

**Files:**
- Modify: `packages/client-solid/vite.config.ts`

- [ ] **Step 1: Add the `node:url` import**

Change:
```ts
import { dirname, join, resolve, sep } from "node:path";
```
to:
```ts
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
```

- [ ] **Step 2: Add the module-level debug block** (identical to Task 1 Step 3, but the binding is `solid-bindings`)

Immediately before `export default defineConfig({`, insert:
```ts
// When the Deploy workflow requests a debuggable build (RTC_SOURCEMAPS=1),
// resolve the @rtc/* workspace libraries from their TypeScript SOURCE instead of
// their prebuilt dist/*.js, so Vite compiles them into the bundle and the inline
// map points at the original .ts. Consuming dist breaks the map chain (Vite's
// esbuild dep pre-bundle drops the libs' own .js.map). Empty in a lean build, so
// production output is unchanged. See docs/superpowers/specs/2026-07-19-debuggable-deploy-design.md.
const debugBuild = process.env.RTC_SOURCEMAPS === "1";
const pkgSrc = (name: string): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), "..", name, "src", "index.ts");
const rtcSourceAlias: Record<string, string> = debugBuild
  ? {
      "@rtc/client-core": pkgSrc("client-core"),
      "@rtc/domain": pkgSrc("domain"),
      "@rtc/shared": pkgSrc("shared"),
      "@rtc/motion-core": pkgSrc("motion-core"),
      "@rtc/devtools-core": pkgSrc("devtools-core"),
      "@rtc/solid-bindings": pkgSrc("solid-bindings"),
    }
  : {};
```

- [ ] **Step 3: Add the `resolve` key** after the `plugins: [...]` array (before `server:`):
```ts
  resolve: { alias: rtcSourceAlias },
```

- [ ] **Step 4: Replace the `build: { ... }` block** with the same block from Task 1 Step 5 (identical — `debugBuild` sourcemap + conditional `-dbg-` rollup output).

- [ ] **Step 5: Build the debug variant and verify** (reuses the scratchpad tool from Task 1 Step 6)

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
RTC_SOURCEMAPS=1 pnpm build --filter=@rtc/client-solid --force
node /private/tmp/claude-501/-Users-csx-workarea-dev-github-com-bettersoftware-io-ReactiveTraderCloudClone/2cbd1e91-0e5e-4e50-b65c-1c516d751b28/scratchpad/check-localmap.mjs packages/client-solid/dist
```
Expected: `dbgNamedFiles` = `jsFiles`, `app` > 0, `rtcSrc` > 0, `rtcDist` = 0. (Add packages / `#/` aliases and re-run if not, as in Task 1 Step 7.)

- [ ] **Step 6: Verify the debug build serves**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy/packages/client-solid
(pnpm exec vite preview --port 4998 >/tmp/vprev-solid.log 2>&1 &) ; sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4998/)
js=$(curl -s http://127.0.0.1:4998/ | grep -oE '/assets/[^"]+-dbg-[^"]+\.js' | head -1)
jscode=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:4998$js")
echo "index=$code  jsbundle=$js -> $jscode"
pkill -f "vite preview --port 4998" || true
```
Expected: `index=200`, a `-dbg-` JS path, `-> 200`.

- [ ] **Step 7: Verify the LEAN build is unchanged**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
pnpm build --filter=@rtc/client-solid --force
ls packages/client-solid/dist/assets/ | grep -c -- "-dbg-" | xargs echo "dbg files in lean build (want 0):"
grep -rl "sourceMappingURL" packages/client-solid/dist/assets/ 2>/dev/null | wc -l | xargs echo "mapped files in lean build (want 0):"
```
Expected: both 0.

- [ ] **Step 8: Typecheck + lint**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
pnpm typecheck --filter=@rtc/client-solid
npx @biomejs/biome ci packages/client-solid/vite.config.ts
```
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
git add packages/client-solid/vite.config.ts
git commit -m "$(cat <<'EOF'
feat(client-solid): resolve @rtc libs from source + -dbg- filenames in debug build

Mirror of client-react: RTC_SOURCEMAPS=1 aliases @rtc/* runtime packages to
src/index.ts so the inline map resolves to original .ts, and emits distinct
-dbg- filenames. Lean build unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FSBT2hKxdjSPc1dY1tTxux
EOF
)"
```

---

### Task 3: Docs — record the source-resolution behaviour

**Files:**
- Modify: `docs/DEPLOY.md` (the "Debuggable (sourcemap) builds" note added in #284).

- [ ] **Step 1: Extend the DEPLOY.md debug-build note**

In `docs/DEPLOY.md`, find the "### Debuggable (sourcemap) builds" section and append a sentence after the existing paragraph:
```markdown

The debug build also resolves the `@rtc/*` libraries to their **original TypeScript**: when `RTC_SOURCEMAPS=1`, Vite aliases those workspace packages to their `src` (compiling them from source rather than consuming `dist/*.js`, whose sourcemap chain Vite's dep pre-bundle would otherwise drop), and emits distinct `-dbg-` filenames so the debug and lean builds never collide in a cache. So a profiled deploy resolves the whole flamechart — app components and presenters/machines — to source.
```

- [ ] **Step 2: Verify doc links**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
pnpm check:doc-links 2>&1 | tail -1
```
Expected: passes.

- [ ] **Step 3: Commit**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/debuggable-deploy
git add docs/DEPLOY.md
git commit -m "$(cat <<'EOF'
docs(deploy): note debug build resolves @rtc libs to source + -dbg- filenames

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FSBT2hKxdjSPc1dY1tTxux
EOF
)"
```

---

## Post-implementation (ship + live verify)

Follow **shipping-repo-changes**: push, PR, CI loop green, triage catch-up, `--merge`, confirm on `origin/main`, remove the worktree. Then live-verify (I have `gh workflow run`):

1. `gh workflow run deploy.yml -f deploy_react=true -f include_sourcemaps=true` → after it completes, fetch the deployed bundle, decode its inline map, assert `packages/*/src/**/*.ts` present and no `@rtc` `/dist/`. Confirm the served JS filename carries `-dbg-`.
2. `gh workflow run deploy.yml -f deploy_react=true` (flag off) → confirm the prod URL flips back to a lean, non-`-dbg-`, no-map bundle cleanly (proves the collision is gone).
3. Repeat 1 for solid (`-f deploy_solid=true -f include_sourcemaps=true`).
4. Hand the user: hard-reload the debug deploy → DevTools → Performance → flamechart frames resolve to `.ts`/`.tsx` (app + presenters/machines).

## Self-Review

- **Spec coverage:** A (alias @rtc→src) → T1 S2-4 / T2 S2-3. B (`-dbg-` filenames) → T1 S5 / T2 S4. C (promotion + guard) → Post-impl 1-2 (the `-dbg-` names remove the collision; existing inline guard is filename-agnostic so it still fires). Full resolution verified → the `check-localmap.mjs` `rtcSrc>0 & rtcDist=0` assertion. Lean unchanged → T1 S9 / T2 S7. `#/` risk → Global Constraints + T1 S7 fallback.
- **Placeholder scan:** none — all code literal.
- **Type/name consistency:** `debugBuild`, `pkgSrc`, `rtcSourceAlias`, `-dbg-`, `RTC_SOURCEMAPS==="1"` identical across both configs; binding differs by client as intended (react-bindings / solid-bindings).
