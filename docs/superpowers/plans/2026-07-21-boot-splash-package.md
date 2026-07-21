# @rtc/boot-splash Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De-duplicate the ~5.5k-LOC canvas boot-splash engine + gate + CSS currently copy-pasted (renamed only) between `@rtc/client-react` and `@rtc/client-solid` into one framework-free `@rtc/boot-splash` package that both clients consume.

**Architecture:** New zero-`@rtc`-dependency leaf package `@rtc/boot-splash` (sibling to `@rtc/motion-core`) holds the canvas engine (`bootCanvas.ts` + 6 `variants/*.ts`), the play-decision gate (`bootSplashGate.ts`), and the two shared `.module.css` files. The canonical source is the **verbose React copy** (Solid's terse twin is discarded). The engine files import each other only via relative paths and have no `@rtc/*`/`#/` imports, so they are **byte-movable** — correctness is a plain zero-diff against the current React copy. The framework `.tsx` shells and `BootSequence.test.tsx` stay per-client.

**Tech Stack:** TypeScript (tsc project build + tsc-alias), Vitest (node env), pnpm workspaces, Turborepo, Vite (both web clients), dependency-cruiser, knip, Biome, ESLint, stylelint.

## Global Constraints

- **Canonical source = the verbose React copy.** Lift files verbatim from `packages/client-react/...`; discard the Solid copies. Do **not** rename identifiers (`Boot*` symbols and `boot*.ts` filenames stay). Any `boot`→`splash` rename is an out-of-scope optional Pass 2.
- **Package name:** `@rtc/boot-splash`. Zero runtime deps; `"private": true`; `"type": "module"`.
- **Dependency rule:** `packages/boot-splash/src` must not import any `@rtc/*` package (enforced by a new `boot-splash-stays-pure` dep-cruiser rule). It *may* touch runtime DOM (the gate reads `navigator`/`window.location`) — it is **not** a "no-DOM" leaf like motion-core.
- **Zero behavioural change.** The splash must render pixel-identically in both clients; the visual golden tier is the oracle.
- **Move via `cp` (copy), not `git mv`.** Keep both clients building through Tasks 1–4; delete the duplicated originals only in Tasks 5–6.
- **Repo invariant:** every gate covers every package. A new package must be registered with knip and dependency-cruiser; Biome/turbo/pnpm-workspace/ESLint (`tsconfig.eslint.json` globs `packages/*/src/**`) pick it up automatically.
- **Full gauntlet commands** (run from repo root): `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint` (`biome lint .`), `biome ci .`, `pnpm lint:eslint` (`eslint .`), `pnpm lint:css` (`stylelint`), `pnpm lint:dead` (`knip`), `pnpm check:deps` (`depcruise`).

---

### Task 1: Scaffold the `@rtc/boot-splash` package

**Files:**
- Create: `packages/boot-splash/package.json`
- Create: `packages/boot-splash/tsconfig.json`
- Create: `packages/boot-splash/vitest.config.ts`
- Create: `packages/boot-splash/README.md`
- Create: `packages/boot-splash/src/index.ts` (empty stub for now)

**Interfaces:**
- Consumes: nothing.
- Produces: an installable, buildable, typecheckable workspace package `@rtc/boot-splash` mirroring `@rtc/motion-core`'s config, exposing `.` (→ `dist/index.js`) and the `#/*` internal alias.

- [ ] **Step 1: Create `packages/boot-splash/package.json`**

```json
{
  "name": "@rtc/boot-splash",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./styles/*": "./src/styles/*"
  },
  "imports": {
    "#/*": "./src/*"
  },
  "scripts": {
    "build": "tsc --build && tsc-alias -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "dev": "tsc-alias -w -p tsconfig.json & tsc --build --watch",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^4.1.8",
    "@vitest/ui": "^4.1.8",
    "tsc-alias": "1.9.0",
    "vitest": "^4"
  }
}
```

Note the `"./styles/*"` export points at `src/` (not `dist/`) — `tsc` does not emit CSS, and both consuming Vite builds read the raw `.module.css` from source. This is used in Task 4.

- [ ] **Step 2: Create `packages/boot-splash/tsconfig.json`** (mirrors motion-core exactly)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo",
    "paths": { "#/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/boot-splash/vitest.config.ts`** (mirrors motion-core: node env)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
    },
  },
});
```

- [ ] **Step 4: Create `packages/boot-splash/src/index.ts`** (empty stub; real exports added in Tasks 2–3)

```ts
export {};
```

- [ ] **Step 5: Create `packages/boot-splash/README.md`**

```markdown
# @rtc/boot-splash

Framework-free boot / splash feature shared by the web clients
(`@rtc/client-react`, `@rtc/client-solid`): the canvas boot-animation engine
(`bootCanvas.ts` + `variants/*`), the play-decision gate (`bootSplashGate.ts`),
and the shared boot stylesheets.

Zero `@rtc/*` dependencies. Unlike `@rtc/motion-core` (pure, no-DOM math) this
package legitimately touches the DOM: the engine draws to a `CanvasRenderingContext2D`
and the gate reads `navigator`/`window.location`. Its only architectural
constraint is that it imports no other `@rtc` package
(`boot-splash-stays-pure` in `.dependency-cruiser.cjs`).

Symbols keep the `Boot*` vocabulary; the package name marries the code term
("boot") with the user-facing term ("splash").
```

- [ ] **Step 6: Install so pnpm links the new workspace package**

Run: `pnpm install`
Expected: completes; `@rtc/boot-splash` linked into the workspace.

- [ ] **Step 7: Verify the package builds and typechecks**

Run: `pnpm --filter @rtc/boot-splash build && pnpm --filter @rtc/boot-splash typecheck`
Expected: both succeed (empty package, `dist/index.js` emitted).

- [ ] **Step 8: Commit**

```bash
git add packages/boot-splash pnpm-lock.yaml
git commit -m "feat(boot-splash): scaffold empty @rtc/boot-splash package"
```

---

### Task 2: Move the canvas engine (bootCanvas + 6 variants) verbatim

**Files:**
- Create: `packages/boot-splash/src/bootCanvas.ts` (copy of `packages/client-react/src/ui/shell/boot/bootCanvas.ts`)
- Create: `packages/boot-splash/src/variants/bootCore.ts`, `bootGeo.ts`, `bootHologram.ts`, `bootJarvis.ts`, `bootLayers.ts`, `bootTopo.ts` (copies of the same-named files under `packages/client-react/src/ui/shell/boot/variants/`)
- Modify: `packages/boot-splash/src/index.ts`

**Interfaces:**
- Consumes: nothing (engine is self-contained; variants import `../bootCanvas` relatively — path is preserved by the identical `src/` + `src/variants/` layout).
- Produces (exported from `@rtc/boot-splash`):
  - `const BOOT_DURATION_MS: number`
  - `interface BootDrawCtx { readonly canvas: HTMLCanvasElement; readonly ctx: CanvasRenderingContext2D; … }`
  - `type BootFrameFn = () => void`
  - `function hexToRgba(hex: string, alpha: number): string`
  - `function ease(t: number): number`
  - `function drawBootLaser(scene: BootDrawCtx): void`
  - `function drawBootDocking(scene: BootDrawCtx): void`
  - `function createBootCore(...)`, `createBootGeo(...)`, `createBootHologram(...)`, `createBootJarvis(...)`, `createBootLayers(...)`, `createBootTopo(...)` — each returns a `BootFrameFn`-producing scene builder (signatures preserved verbatim from the source).

- [ ] **Step 1: Copy the engine files verbatim**

```bash
cd packages
mkdir -p boot-splash/src/variants
cp client-react/src/ui/shell/boot/bootCanvas.ts boot-splash/src/bootCanvas.ts
for v in bootCore bootGeo bootHologram bootJarvis bootLayers bootTopo; do
  cp "client-react/src/ui/shell/boot/variants/$v.ts" "boot-splash/src/variants/$v.ts"
done
cd ..
```

- [ ] **Step 2: Prove the move is byte-identical (zero-diff correctness)**

```bash
cd packages
diff client-react/src/ui/shell/boot/bootCanvas.ts boot-splash/src/bootCanvas.ts && echo "bootCanvas: IDENTICAL"
for v in bootCore bootGeo bootHologram bootJarvis bootLayers bootTopo; do
  diff "client-react/src/ui/shell/boot/variants/$v.ts" "boot-splash/src/variants/$v.ts" && echo "$v: IDENTICAL"
done
cd ..
```

Expected: every `diff` prints nothing and the `IDENTICAL` line — proving no logic/constant drift (byte-faithful move). If any diff is non-empty, the copy was altered — redo Step 1.

- [ ] **Step 3: Wire the public surface in `packages/boot-splash/src/index.ts`**

```ts
export {
  BOOT_DURATION_MS,
  type BootDrawCtx,
  type BootFrameFn,
  drawBootDocking,
  drawBootLaser,
  ease,
  hexToRgba,
} from "#/bootCanvas";
export { createBootCore } from "#/variants/bootCore";
export { createBootGeo } from "#/variants/bootGeo";
export { createBootHologram } from "#/variants/bootHologram";
export { createBootJarvis } from "#/variants/bootJarvis";
export { createBootLayers } from "#/variants/bootLayers";
export { createBootTopo } from "#/variants/bootTopo";
```

(Re-exporting the full `bootCanvas` surface — including `BOOT_DURATION_MS`/`hexToRgba`/`ease` used internally by the variants — keeps them reachable from the package entry so knip does not flag them.)

- [ ] **Step 4: Verify the package builds and typechecks**

Run: `pnpm --filter @rtc/boot-splash build && pnpm --filter @rtc/boot-splash typecheck`
Expected: both succeed. The engine references `HTMLCanvasElement`/`CanvasRenderingContext2D` in type position; the base tsconfig's default `lib` includes DOM, so this compiles without a `lib` override.

- [ ] **Step 5: Commit**

```bash
git add packages/boot-splash/src
git commit -m "feat(boot-splash): move canvas engine (bootCanvas + variants) verbatim"
```

---

### Task 3: Move the play-decision gate + its test verbatim

**Files:**
- Create: `packages/boot-splash/src/bootSplashGate.ts` (copy of `packages/client-react/src/bootSplashGate.ts`)
- Create: `packages/boot-splash/src/bootSplashGate.test.ts` (copy of `packages/client-react/src/bootSplashGate.test.ts`)
- Modify: `packages/boot-splash/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exported from `@rtc/boot-splash`): `function shouldPlayBootSplash(): boolean` — true if the splash should play this load (suppressed under `navigator.webdriver` and `?nosplash`; forced by `?splash`).

- [ ] **Step 1: Copy the gate and its test verbatim**

```bash
cd packages
cp client-react/src/bootSplashGate.ts boot-splash/src/bootSplashGate.ts
cp client-react/src/bootSplashGate.test.ts boot-splash/src/bootSplashGate.test.ts
cd ..
```

The test imports `./bootSplashGate` (relative) — valid unchanged in the new location.

- [ ] **Step 2: Prove byte-identical**

```bash
cd packages
diff client-react/src/bootSplashGate.ts boot-splash/src/bootSplashGate.ts && echo "gate: IDENTICAL"
diff client-react/src/bootSplashGate.test.ts boot-splash/src/bootSplashGate.test.ts && echo "gate test: IDENTICAL"
cd ..
```

Expected: both diffs empty + `IDENTICAL` lines.

- [ ] **Step 3: Add the gate to the public surface — append to `packages/boot-splash/src/index.ts`**

```ts
export { shouldPlayBootSplash } from "#/bootSplashGate";
```

- [ ] **Step 4: Run the moved test (proves the package has real, green coverage)**

Run: `pnpm --filter @rtc/boot-splash test`
Expected: PASS — the `shouldPlayBootSplash` suite runs green in node env.

- [ ] **Step 5: Commit**

```bash
git add packages/boot-splash/src
git commit -m "feat(boot-splash): move bootSplashGate + test verbatim"
```

---

### Task 4: Move the shared stylesheets + expose them via the package

**Files:**
- Create: `packages/boot-splash/src/styles/BootSequence.module.css` (copy of `packages/client-react/src/ui/shell/boot/BootSequence.module.css`)
- Create: `packages/boot-splash/src/styles/BootGate.module.css` (copy of `packages/client-react/src/ui/shell/boot/BootGate.module.css`)

**Interfaces:**
- Consumes: nothing.
- Produces: two CSS-module stylesheets resolvable by consumers as `@rtc/boot-splash/styles/BootSequence.module.css` and `@rtc/boot-splash/styles/BootGate.module.css` (via the `"./styles/*"` export added in Task 1). Class names are hashed per file; rendering is unaffected (goldens compare pixels; contract tests key on `data-testid`).

- [ ] **Step 1: Copy the stylesheets verbatim**

```bash
cd packages
mkdir -p boot-splash/src/styles
cp client-react/src/ui/shell/boot/BootSequence.module.css boot-splash/src/styles/BootSequence.module.css
cp client-react/src/ui/shell/boot/BootGate.module.css boot-splash/src/styles/BootGate.module.css
cd ..
```

- [ ] **Step 2: Prove byte-identical**

```bash
cd packages
diff client-react/src/ui/shell/boot/BootSequence.module.css boot-splash/src/styles/BootSequence.module.css && echo "BootSequence.css: IDENTICAL"
diff client-react/src/ui/shell/boot/BootGate.module.css boot-splash/src/styles/BootGate.module.css && echo "BootGate.css: IDENTICAL"
cd ..
```

Expected: both empty + `IDENTICAL`.

- [ ] **Step 3: Verify stylelint accepts the relocated CSS**

Run: `pnpm lint:css`
Expected: PASS (the `packages/*/src/**/*.css` glob now covers `boot-splash/src/styles/*`).

- [ ] **Step 4: Commit**

```bash
git add packages/boot-splash/src/styles
git commit -m "feat(boot-splash): host the shared boot stylesheets"
```

---

### Task 5: Rewire `@rtc/client-react` onto the package and delete its duplicates

**Files:**
- Modify: `packages/client-react/package.json` (add dep)
- Modify: `packages/client-react/src/ui/shell/boot/BootSequence.tsx:7-20` (imports)
- Modify: `packages/client-react/src/ui/shell/boot/BootGate.tsx:7` (CSS import)
- Modify: `packages/client-react/src/app/buildBrowserPorts.ts:27` (gate import)
- Delete: `packages/client-react/src/ui/shell/boot/bootCanvas.ts`, `.../variants/{bootCore,bootGeo,bootHologram,bootJarvis,bootLayers,bootTopo}.ts`, `.../BootSequence.module.css`, `.../BootGate.module.css`, `packages/client-react/src/bootSplashGate.ts`, `packages/client-react/src/bootSplashGate.test.ts` (11 files)

**Interfaces:**
- Consumes: the full `@rtc/boot-splash` public surface (Task 2 + Task 3) and the `./styles/*` CSS export (Task 4).
- Produces: a `client-react` that owns only the framework `.tsx` shells + `BootSequence.test.tsx`, sourcing all engine/gate/CSS from `@rtc/boot-splash`.

- [ ] **Step 1: Add the workspace dependency to `packages/client-react/package.json`**

In the `"dependencies"` block, add the line (keep alphabetical order — it sits just before `@rtc/client-core`):

```json
    "@rtc/boot-splash": "workspace:*",
```

- [ ] **Step 2: Rewire `packages/client-react/src/ui/shell/boot/BootSequence.tsx`**

Replace the seven engine import lines (currently lines 7–18, the `from "./bootCanvas"` block plus the six `./variants/*` imports) **and** the CSS import (line 20 `import styles from "./BootSequence.module.css";`) with:

```tsx
import {
  type BootDrawCtx,
  type BootFrameFn,
  createBootCore,
  createBootGeo,
  createBootHologram,
  createBootJarvis,
  createBootLayers,
  createBootTopo,
  drawBootDocking,
  drawBootLaser,
} from "@rtc/boot-splash";

import styles from "@rtc/boot-splash/styles/BootSequence.module.css";
```

Leave the `react`/`@rtc/domain`/`@rtc/react-bindings` imports above untouched. (Biome import-sort will order the group; run `biome check --write` in Step 6.)

- [ ] **Step 3: Rewire the CSS import in `packages/client-react/src/ui/shell/boot/BootGate.tsx`**

Replace line 7 `import styles from "./BootGate.module.css";` with:

```tsx
import styles from "@rtc/boot-splash/styles/BootGate.module.css";
```

- [ ] **Step 4: Rewire the gate import in `packages/client-react/src/app/buildBrowserPorts.ts`**

Replace line 27 `import { shouldPlayBootSplash } from "#/bootSplashGate";` with:

```ts
import { shouldPlayBootSplash } from "@rtc/boot-splash";
```

- [ ] **Step 5: Delete the 11 duplicated originals**

```bash
cd packages/client-react/src
rm ui/shell/boot/bootCanvas.ts
rm ui/shell/boot/variants/bootCore.ts ui/shell/boot/variants/bootGeo.ts \
   ui/shell/boot/variants/bootHologram.ts ui/shell/boot/variants/bootJarvis.ts \
   ui/shell/boot/variants/bootLayers.ts ui/shell/boot/variants/bootTopo.ts
rmdir ui/shell/boot/variants 2>/dev/null || true
rm ui/shell/boot/BootSequence.module.css ui/shell/boot/BootGate.module.css
rm bootSplashGate.ts bootSplashGate.test.ts
cd ../../..
```

- [ ] **Step 6: Normalize import ordering**

Run: `pnpm --filter @rtc/client-react exec biome check --write src`
Expected: rewrites import groups; exits clean.

- [ ] **Step 7: Verify client-react typechecks, builds, and its tests pass**

Run: `pnpm install && pnpm --filter @rtc/boot-splash build && pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react build && pnpm --filter @rtc/client-react test`
Expected: all green. (Building boot-splash first ensures its `dist` + declarations exist for client-react's typecheck/build. The Vite build resolves the `@rtc/boot-splash/styles/*.module.css` imports from source and processes them as CSS modules.)

- [ ] **Step 8: Commit**

```bash
git add packages/client-react packages/boot-splash pnpm-lock.yaml
git commit -m "refactor(client-react): source boot-splash from @rtc/boot-splash; delete duplicates"
```

---

### Task 6: Rewire `@rtc/client-solid` onto the package and delete its duplicates

**Files:**
- Modify: `packages/client-solid/package.json` (add dep)
- Modify: `packages/client-solid/src/ui/shell/boot/BootSequence.tsx:7-20` (imports)
- Modify: `packages/client-solid/src/ui/shell/boot/BootGate.tsx:8` (CSS import)
- Modify: `packages/client-solid/src/app/buildBrowserPorts.ts:27` (gate import)
- Delete: the same 11 files under `packages/client-solid/...` as in Task 5

**Interfaces:**
- Consumes: the `@rtc/boot-splash` public surface + `./styles/*` CSS export.
- Produces: a `client-solid` owning only its framework `.tsx` shells + `BootSequence.test.tsx`, discarding the terse duplicate engine/gate/CSS.

- [ ] **Step 1: Add the workspace dependency to `packages/client-solid/package.json`**

In `"dependencies"`, add (alphabetical, before `@rtc/client-core`):

```json
    "@rtc/boot-splash": "workspace:*",
```

- [ ] **Step 2: Rewire `packages/client-solid/src/ui/shell/boot/BootSequence.tsx`**

Replace the seven engine import lines (7–18) and the CSS import (line 20 `import styles from "./BootSequence.module.css";`) with the identical block used in Task 5 Step 2:

```tsx
import {
  type BootDrawCtx,
  type BootFrameFn,
  createBootCore,
  createBootGeo,
  createBootHologram,
  createBootJarvis,
  createBootLayers,
  createBootTopo,
  drawBootDocking,
  drawBootLaser,
} from "@rtc/boot-splash";

import styles from "@rtc/boot-splash/styles/BootSequence.module.css";
```

Leave the `solid-js`/`@rtc/domain`/`@rtc/solid-bindings` imports above untouched.

- [ ] **Step 3: Rewire the CSS import in `packages/client-solid/src/ui/shell/boot/BootGate.tsx`**

Replace line 8 `import styles from "./BootGate.module.css";` with:

```tsx
import styles from "@rtc/boot-splash/styles/BootGate.module.css";
```

- [ ] **Step 4: Rewire the gate import in `packages/client-solid/src/app/buildBrowserPorts.ts`**

Replace line 27 `import { shouldPlayBootSplash } from "#/bootSplashGate";` with:

```ts
import { shouldPlayBootSplash } from "@rtc/boot-splash";
```

- [ ] **Step 5: Delete the 11 duplicated originals**

```bash
cd packages/client-solid/src
rm ui/shell/boot/bootCanvas.ts
rm ui/shell/boot/variants/bootCore.ts ui/shell/boot/variants/bootGeo.ts \
   ui/shell/boot/variants/bootHologram.ts ui/shell/boot/variants/bootJarvis.ts \
   ui/shell/boot/variants/bootLayers.ts ui/shell/boot/variants/bootTopo.ts
rmdir ui/shell/boot/variants 2>/dev/null || true
rm ui/shell/boot/BootSequence.module.css ui/shell/boot/BootGate.module.css
rm bootSplashGate.ts bootSplashGate.test.ts
cd ../../..
```

- [ ] **Step 6: Normalize import ordering**

Run: `pnpm --filter @rtc/client-solid exec biome check --write src`
Expected: exits clean.

- [ ] **Step 7: Verify client-solid typechecks, builds, and its tests pass**

Run: `pnpm --filter @rtc/client-solid typecheck && pnpm --filter @rtc/client-solid build && pnpm --filter @rtc/client-solid test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/client-solid pnpm-lock.yaml
git commit -m "refactor(client-solid): source boot-splash from @rtc/boot-splash; delete duplicates"
```

---

### Task 7: Wire the new-package gates + run the full gauntlet

**Files:**
- Modify: `.dependency-cruiser.cjs` (add `boot-splash-stays-pure` rule)
- Modify: `knip.json` (add `packages/boot-splash` workspace entry)
- Modify: `CLAUDE.md` (package list + count) and `docs/architecture/06-package-dependencies.md` if it enumerates packages (doc sync)

**Interfaces:**
- Consumes: the completed package + rewired clients.
- Produces: a repo where every global gate (typecheck, test, biome, eslint, stylelint, knip, dependency-cruiser) passes with `@rtc/boot-splash` registered.

- [ ] **Step 1: Add the `boot-splash-stays-pure` dependency-cruiser rule**

In `.dependency-cruiser.cjs`, in the `forbidden` rules array, immediately after the `motion-core-stays-pure` rule object, add (mirrors it; note DOM is intentionally *not* forbidden — only `@rtc/*` package imports are):

```js
    {
      name: "boot-splash-stays-pure",
      severity: "error",
      comment:
        "@rtc/boot-splash is the framework-free boot/splash feature — it must not import any other @rtc package (it may touch the DOM: canvas engine + navigator/location gate).",
      from: { path: "^packages/boot-splash/src" },
      to: {
        path: "^packages/(domain|shared|client-core|react-bindings|solid-bindings|client-react|client-react-native|client-prototype|client-solid|ui-contract|motion-core|server|ws-effects|devtools-core|devtools-app|devtools-relay|devtools-extension)/",
      },
    },
```

- [ ] **Step 2: Register the package with knip**

In `knip.json`, add a workspace entry alongside the other leaves (e.g. after the `packages/motion-core` block):

```json
    "packages/boot-splash": {
      "entry": "src/index.ts",
      "project": "src/**/*.ts"
    },
```

- [ ] **Step 3: Run dependency-cruiser**

Run: `pnpm check:deps`
Expected: PASS — no `boot-splash-stays-pure` violation (the engine/gate import no `@rtc/*`), and the new client → `@rtc/boot-splash` edges violate no rule. There is no `no-orphans` rule, so the package is not flagged for having few importers.

- [ ] **Step 4: Run knip**

Run: `pnpm lint:dead`
Expected: PASS — every `@rtc/boot-splash` export is reachable from `src/index.ts` and consumed by the two clients; no unused files/exports/deps reported for the new package.

- [ ] **Step 5: Update `CLAUDE.md` and package-graph doc**

- In `CLAUDE.md`: bump the package count in "Current Status" (seventeen → eighteen packages) and add a `boot-splash/` line to the Package Structure block describing `@rtc/boot-splash` as the framework-free boot/splash feature shared by the web clients. Note in the dependency-rule paragraph that it is a DOM-touching (not no-DOM) leaf policed by `boot-splash-stays-pure`.
- If `docs/architecture/06-package-dependencies.md` enumerates the package set / graph, add `@rtc/boot-splash` as a leaf consumed by `client-react` + `client-solid`.

- [ ] **Step 6: Run the full repo gauntlet**

Run each, expecting all green:

```bash
pnpm build
pnpm typecheck
pnpm test
biome ci .
pnpm lint:eslint
pnpm lint:css
pnpm lint:dead
pnpm check:deps
pnpm check:doc-links
```

Expected: all pass. (`biome ci .` covers format + import-sort — the CI gate beyond local `biome lint`.)

- [ ] **Step 7: Run the visual golden tier — the behavioural oracle**

Run: `pnpm test:ui:visual`
Expected: PASS with **no golden changes** for the boot/splash scenarios in either client — proving the splash still renders pixel-identically after the extraction. If a boot scenario diffs, the move altered rendering — stop and diagnose (do not re-baseline).

- [ ] **Step 8: Commit**

```bash
git add .dependency-cruiser.cjs knip.json CLAUDE.md docs/architecture/06-package-dependencies.md
git commit -m "chore(boot-splash): wire package gates + doc sync"
```

---

## Self-Review

**Spec coverage:**
- New `@rtc/boot-splash` package, zero-`@rtc`-dep leaf → Task 1. ✓
- Canonical = verbose React copy; engine moved → Task 2. ✓
- Gate + test moved → Task 3. ✓
- Two identical CSS moved + cross-package exposure (the flagged wrinkle) → Task 4 + verified in Task 5/6 client Vite builds. ✓
- Rewire both clients + delete 22 duplicates (11 each) → Tasks 5, 6. ✓
- Correctness = zero-diff (stronger than fingerprint, since byte-movable) → Tasks 2–4 Step 2; visual goldens oracle → Task 7 Step 7. ✓
- New-package gate wiring (dep-cruiser rule + knip; eslint/biome/turbo/pnpm by glob) → Task 7. ✓
- `boot-splash-stays-pure` polices package deps only, not DOM → Task 7 Step 1. ✓
- Scope boundary: `.tsx` shells + `BootSequence.test.tsx` stay; RN/prototype/client-core untouched → not moved in any task. ✓
- Symbols stay `Boot*` (no rename); Pass 2 out of scope → Global Constraints. ✓

**Placeholder scan:** none — every code/CSS/config edit shows exact content; every verification is a concrete command + expected result.

**Type consistency:** the `index.ts` re-exports (Task 2/3) match the names consumed in the client import blocks (Task 5/6): `BootDrawCtx`, `BootFrameFn`, `drawBootDocking`, `drawBootLaser`, `createBoot{Core,Geo,Hologram,Jarvis,Layers,Topo}`, `shouldPlayBootSplash`. CSS export path `@rtc/boot-splash/styles/*.module.css` matches the `"./styles/*": "./src/styles/*"` map in Task 1. Consistent. ✓

**Known risk carried from spec:** CSS-module cross-package resolution — mitigated by pointing the `styles` export at `src` (Vite reads raw CSS) and proven by the client Vite builds (Task 5/6 Step 7) + visual goldens (Task 7 Step 7).
