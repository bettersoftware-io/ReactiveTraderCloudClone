# Phase 0 — `client-core` / `react-bindings` extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the framework-neutral app layer out of `@rtc/client-react` into two new workspace packages — `@rtc/client-core` (neutral presenters/machines/composition/portFactory/layout) and `@rtc/react-bindings` (the React bridge hooks) — leaving `client-react` as a thin shell of DOM leaf components + browser adapters, with **zero behavior change**.

**Architecture:** Behavior-preserving refactor. The existing test suite is the characterization test: every task ends green (`pnpm build && pnpm typecheck && pnpm test`, plus lint + contract-coverage in the final task). The one genuine code change is inverting composition to **dependency injection** so the neutral packages never import a browser-only adapter; everything else is `git mv` + import re-pointing. This is Phase 0 of the React-Native-client program (see `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md`); no Expo/RN code is touched here.

**Tech Stack:** pnpm workspaces + Turborepo, TypeScript (`tsc --build` + `tsc-alias` for the new libs, matching `@rtc/domain`/`@rtc/shared`), RxJS 7, `@rx-state/core` (machines), `@react-rxjs/core` (React bridge), Vitest.

## Global Constraints

- **Dependency direction:** `domain → shared → client-core → react-bindings → client-react`. Apps never depend on each other; everything flows inward. `client-core` must import **no React, no DOM, no `react-dom`, no browser globals** (`window`/`document`/`navigator`/`localStorage`). `react-bindings` may import `react` + `@react-rxjs/core` but **no `react-dom`** and **no DOM** (it is shared with the future React Native app).
- **The `@rtc/domain` single-runtime-dep rule (`rxjs` only) is unchanged** — it applies to `domain` only. `client-core` is an app-layer package and may depend on `rxjs` + `@rx-state/core`.
- **Subpath alias:** use `#/*` → `./src/*` (package.json `imports` + tsconfig `paths`), never `@/`. New tsc-built libs need `tsc --build && tsc-alias -p tsconfig.json` (tsc leaks `#/` aliases into `dist` otherwise).
- **No relative climbs ≥ 2 levels:** Biome `noRestrictedImports` bans `../../**` repo-wide. Use `#/` within a package and `@rtc/<pkg>` across packages.
- **Lint/format gate:** Biome must report zero findings with **no inline disables**; CI also runs ESLint (`lint:eslint`, `lint:eslint:types`) and Stylelint (`lint:css`) on top of Biome. Biome-clean ≠ CI-clean.
- **Node 26** (CI + sandbox). Never set pnpm `node-linker=hoisted`.
- **Shipping:** all work is in the worktree on branch `worktree-rn-expo-client-spec`; ship via PR → CI green (read with `gh run list --workflow CI`, never `gh pr checks`) → `--merge` merge commit. Per-task commits are local on the branch.

---

## File Structure

**New package `packages/client-core/`** (neutral):
```
package.json            @rtc/client-core — deps: @rtc/domain, @rtc/shared, rxjs, @rx-state/core
tsconfig.json           extends base; paths #/* → ./src/*; references domain, shared
src/index.ts            barrel re-exports (presenters, machines, composition, ports, layout)
src/presenters/**       (moved from client-react/src/app/presenters)
src/machine.ts          (moved; the Machine type + base)
src/layout/**           (moved from client-react/src/app/layout)
src/theme/colorSchemeSource.ts  (moved; neutral ColorSchemeSource port interface — MediaQueryColorSchemeAdapter stays in client-react)
src/composition.ts      neutral: createApp, createMachineFactories, routeIdleLifecycle, types
src/adapters/IWsAdapter.ts             (moved; interface)
src/adapters/WsConnectionEventsAdapter.ts (moved; universal)
src/adapters/portFactory.ts            (moved; preferences now injected)
src/wsUrl.ts                           (moved; universal — uses URL)
vitest.config.ts        node environment, globals, fake-timer friendly
```

**New package `packages/react-bindings/`** (React family):
```
package.json            @rtc/react-bindings — deps: @rtc/client-core, react, @react-rxjs/core, rxjs
tsconfig.json           extends base; jsx: react-jsx; paths #/* → ./src/*; references client-core
src/index.ts            barrel: createViewModel, ViewModel, useViewModel, useMachine, ViewModelProvider, ViewModelContext
src/createViewModel.ts  (moved from client-react/src/ui/viewModel)
src/useMachine.ts       (moved)
src/useViewModel.ts     (moved)
src/ViewModelContext.ts (moved)
src/ViewModelProvider.tsx (moved)
vitest.config.ts        jsdom environment (React view-model hooks render)
```

> **Post-merge reconciliation (2026-06-30):** `origin/main` was merged into this branch before execution. Two relevant changes landed: **(1) PR #55 (ADR-004) renamed the React DI seam Hooks/AppHooks → ViewModel** and relocated it to `client-react/src/ui/viewModel/` — so the bridge files are now `createViewModel.ts` / `useViewModel.ts` / `ViewModelContext.ts` / `ViewModelProvider.tsx` / `useMachine.ts` (Task 6 reflects this); **(2) Phases 4–5 (telemetry/admin/layout) grew `portFactory.ts` and `composition.ts`** — all line numbers cited below have drifted, so **trust the `grep` commands over any hardcoded line number**. The premises still hold: `portFactory` still `new LocalStoragePreferencesAdapter()`s internally (now lines ~136/~964), and `composition.ts` still has `buildDefaultPorts()` (now ~153) with `createApp(ports = buildDefaultPorts())` (~213).

**`packages/client-react/`** keeps (browser shell):
```
src/app/buildBrowserPorts.ts   NEW — constructs LocalStorage/Browser/Ws adapters, reads env,
                               calls client-core factories; was the browser half of composition.ts
src/app/adapters/WsAdapter.ts                  (stays — uses `new WebSocket`)
src/app/adapters/BrowserConnectionEventsAdapter.ts (stays — window online/offline)
src/app/adapters/LocalStoragePreferencesAdapter.ts (stays — localStorage)
src/AppRoot.tsx                rewired: createApp(buildBrowserPorts()), view model from react-bindings
src/ui/**                      DOM leaf components (unchanged except hook import paths)
```

---

## Task 1: Scaffold empty `@rtc/client-core` package

**Files:**
- Create: `packages/client-core/package.json`
- Create: `packages/client-core/tsconfig.json`
- Create: `packages/client-core/src/index.ts`

**Interfaces:**
- Produces: a buildable workspace package `@rtc/client-core` exporting nothing yet (`export {}`).

- [ ] **Step 1: Create `packages/client-core/package.json`**

```json
{
  "name": "@rtc/client-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "imports": { "#/*": "./src/*" },
  "scripts": {
    "build": "tsc --build && tsc-alias -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports 2>/dev/null || true"
  },
  "dependencies": {
    "@rtc/domain": "workspace:*",
    "@rtc/shared": "workspace:*",
    "@rx-state/core": "^0.1.4",
    "rxjs": "^7.8"
  },
  "devDependencies": {
    "@types/node": "^26.0.0",
    "@vitest/coverage-v8": "^4.1.8",
    "tsc-alias": "1.8.17",
    "vitest": "^4"
  }
}
```

- [ ] **Step 2: Create `packages/client-core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": { "#/*": ["./src/*"] },
    "types": ["node"],
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo"
  },
  "references": [{ "path": "../domain" }, { "path": "../shared" }],
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/client-core/src/index.ts`**

```ts
export {};
```

- [ ] **Step 4: Install + build to verify the package resolves**

Run: `pnpm install && pnpm --filter @rtc/client-core build`
Expected: install succeeds (no peer/strict errors); build emits `packages/client-core/dist/index.js` and `index.d.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/client-core pnpm-lock.yaml
git commit -m "build(client-core): scaffold empty @rtc/client-core package"
```

---

## Task 2: Scaffold empty `@rtc/react-bindings` package

**Files:**
- Create: `packages/react-bindings/package.json`
- Create: `packages/react-bindings/tsconfig.json`
- Create: `packages/react-bindings/src/index.ts`

**Interfaces:**
- Consumes: `@rtc/client-core` (workspace).
- Produces: a buildable workspace package `@rtc/react-bindings` exporting nothing yet.

- [ ] **Step 1: Create `packages/react-bindings/package.json`** (note: **no `react-dom`**)

```json
{
  "name": "@rtc/react-bindings",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "imports": { "#/*": "./src/*" },
  "scripts": {
    "build": "tsc --build && tsc-alias -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports 2>/dev/null || true"
  },
  "dependencies": {
    "@react-rxjs/core": "^0.10.7",
    "@rtc/client-core": "workspace:*",
    "react": "^19",
    "rxjs": "^7.8"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19",
    "@vitest/coverage-v8": "^4.1.8",
    "jsdom": "^25",
    "tsc-alias": "1.8.17",
    "vitest": "^4"
  }
}
```

> Pin `@testing-library/react`, `@types/react`, `jsdom` to the versions already in `client-react`'s lockfile entries if they differ — run `pnpm why @types/react` and match. syncpack enforces single ranges repo-wide.

- [ ] **Step 2: Create `packages/react-bindings/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": { "#/*": ["./src/*"] },
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo"
  },
  "references": [{ "path": "../client-core" }],
  "include": ["src"]
}
```

> `lib` includes `DOM` only for React's ambient types; the package itself must not call DOM APIs (enforced by review in later tasks).

- [ ] **Step 3: Create `packages/react-bindings/src/index.ts`**

```ts
export {};
```

- [ ] **Step 4: Install + build**

Run: `pnpm install && pnpm --filter @rtc/react-bindings build`
Expected: install succeeds; `packages/react-bindings/dist/index.js` emitted.

- [ ] **Step 5: Commit**

```bash
git add packages/react-bindings pnpm-lock.yaml
git commit -m "build(react-bindings): scaffold empty @rtc/react-bindings package"
```

---

## Task 3: Move presenters, machines, and layout into `client-core`

This is the bulk move and involves **no DI change** — pure relocation + intra-package import re-pointing.

**Files:**
- Move (whole dirs): `packages/client-react/src/app/presenters/` → `packages/client-core/src/presenters/`; `packages/client-react/src/app/layout/` → `packages/client-core/src/layout/`
- Move: `packages/client-react/src/app/presenters/machine.ts` travels inside the dir move.
- **Move (theme interface — neutral port):** `packages/client-react/src/app/theme/colorSchemeSource.ts` → `packages/client-core/src/theme/colorSchemeSource.ts`. This is a pure rxjs-typed port interface (`ColorSchemeSource`) that `ThemePreferencePresenter` (now in client-core) depends on, so it must travel with the presenters. **Leave `packages/client-react/src/app/theme/MediaQueryColorSchemeAdapter.ts` in client-react** — it is the browser `window.matchMedia` implementation (it stays, like `WsAdapter`/`BrowserConnectionEventsAdapter`/`LocalStoragePreferencesAdapter`), and its import of the interface re-points from `#/app/theme/colorSchemeSource` → `@rtc/client-core`. (`MediaQueryColorSchemeAdapter` is constructed in `composition.ts`'s browser half today; it migrates into `buildBrowserPorts` in Task 5.)
- Modify: every moved file's intra-imports (`#/app/presenters/X` → `#/presenters/X`, `#/app/layout/X` → `#/layout/X`, `#/app/theme/colorSchemeSource` → `#/theme/colorSchemeSource`).
- Modify: `packages/client-core/src/index.ts` (barrel) — include the theme interface.
- Modify: re-point sites in `client-react` that import these (chiefly `src/ui/viewModel/createViewModel.ts`, `AppRoot.tsx`, `src/app/theme/MediaQueryColorSchemeAdapter.ts`, and UI components).

**Interfaces:**
- Produces (from `@rtc/client-core`): all presenter classes (e.g. `PriceStreamPresenter`, `CurrencyPairsPresenter`, `ConnectionStatusPresenter`, `BlotterPresenter`, `TradeExecutionPresenter`, …), all machine factories (e.g. `createNotionalMachine`, `createLayoutMachine`, `createBootSequenceMachine`, …), the `Machine`/`MachineFactories` types from `machine.ts`, and layout (`createDefaultLayoutPort`, `WorkspaceTab`, `layoutPort` types).

- [ ] **Step 1: Move the directories with git (preserves history)**

```bash
git mv packages/client-react/src/app/presenters packages/client-core/src/presenters
git mv packages/client-react/src/app/layout packages/client-core/src/layout
mkdir -p packages/client-core/src/theme
git mv packages/client-react/src/app/theme/colorSchemeSource.ts packages/client-core/src/theme/colorSchemeSource.ts
```
(`packages/client-react/src/app/theme/MediaQueryColorSchemeAdapter.ts` stays put.)

- [ ] **Step 2: Re-point intra-package imports inside the moved files**

In `packages/client-core/src/presenters/**` and `packages/client-core/src/layout/**`, replace import path prefixes:
- `#/app/presenters/` → `#/presenters/`
- `#/app/layout/` → `#/layout/`
- `#/app/presenters/machine` → `#/presenters/machine`

Find them: `grep -rn "#/app/" packages/client-core/src` — every hit must become a `#/...` path with the `app/` segment dropped. Imports of `@rtc/domain` / `@rtc/shared` / `rxjs` / `@rx-state/core` are unchanged.

- [ ] **Step 3: Write the `client-core` barrel** `packages/client-core/src/index.ts`

```ts
export * from "#/presenters/index";
export * from "#/layout/index";
export * from "#/theme/colorSchemeSource";
```

If `presenters/` and `layout/` lack an `index.ts`, create one in each that re-exports every public module (list them explicitly; do not use a glob). Example `packages/client-core/src/layout/index.ts`:

```ts
export * from "#/layout/defaultLayoutPort";
export * from "#/layout/layoutPort";
```

For `presenters/index.ts`, re-export each presenter and machine module by name (one `export * from "#/presenters/<File>"` line per source file in the directory, excluding `__tests__`).

- [ ] **Step 4: Re-point `client-react` consumers to `@rtc/client-core`**

In `packages/client-react/src`, replace the presenter/layout import sites (chiefly `src/ui/viewModel/createViewModel.ts`, `AppRoot.tsx`, and a few UI components). Each `import { X } from "#/app/presenters/Y"` or `"#/app/layout/Y"` becomes `import { X } from "@rtc/client-core"`. Note `createViewModel.ts` imports many presenter/machine types via `#/app/presenters/*` and `#/app/layout/*` (e.g. `AppCommands`/`Presenters` from `#/app/composition`, `MachineFactories` from `#/app/presenters/machine`) — re-point the presenter/layout ones now; the `#/app/composition` import is re-pointed in Task 5 when composition moves.

Find them: `grep -rn '#/app/\(presenters\|layout\|theme/colorSchemeSource\)' packages/client-react/src`. Re-point every hit (this includes `src/app/theme/MediaQueryColorSchemeAdapter.ts`, which imports the now-moved `ColorSchemeSource` interface). Add `"@rtc/client-core": "workspace:*"` to `packages/client-react/package.json` dependencies.

- [ ] **Step 5: Install, build, typecheck, test — verify green**

Run:
```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```
Expected: all green. (The moved presenter/machine/layout unit tests now run under `@rtc/client-core`; `client-react`'s suite still passes via the re-pointed imports.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(client-core): move presenters, machines, layout from client-react"
```

---

## Task 4: Move portFactory + neutral adapters into `client-core`, injecting `preferences`

The genuine code change: `createSimulatorPorts` / `createWsRealPorts` currently `new LocalStoragePreferencesAdapter()` internally (browser-only). Invert to accept an injected `PreferencesPort`.

**Files:**
- Move: `packages/client-react/src/app/adapters/IWsAdapter.ts` → `packages/client-core/src/adapters/IWsAdapter.ts`
- Move: `packages/client-react/src/app/adapters/WsConnectionEventsAdapter.ts` (+ its `.test.ts`) → `packages/client-core/src/adapters/`
- Move: `packages/client-react/src/app/adapters/portFactory.ts` (+ `portFactory.test.ts`, `portFactory.equities.test.ts`) → `packages/client-core/src/adapters/`
- Move: `packages/client-react/src/app/adapters/__tests__/FakeWsAdapter.ts`, `FakeWsAdapter.test.ts`, `awaitPendingRpc.ts`, and the `wsReal*.contract.test.ts` / `wsReal*.errors.test.ts` files → `packages/client-core/src/adapters/` (mirror the `__tests__` subdir).
- Move: `packages/client-react/src/app/wsUrl.ts` (+ `wsUrl.test.ts`) → `packages/client-core/src/wsUrl.ts`
- Stay in `client-react`: `WsAdapter.ts` (+ test), `BrowserConnectionEventsAdapter.ts` (+ test), `LocalStoragePreferencesAdapter.ts`, `preferences.contract.test.ts`.
- Modify: `portFactory.ts` signatures (DI); update all callers + the moved tests.

**Interfaces:**
- Produces (from `@rtc/client-core`):
  - `interface AppPorts { referenceData; pricing; execution; blotter; analytics; instruments; dealers; workflow; admin; preferences; connectionEvents; marketData; orders; positions }`
  - `type TransportPorts = Omit<AppPorts, "connectionEvents">`
  - `function createSimulatorPorts(deps: { preferences: PreferencesPort }): TransportPorts`
  - `function createWsRealPorts(ws: IWsAdapter, deps: { preferences: PreferencesPort }): TransportPorts`
  - `interface IWsAdapter` (unchanged), `class WsConnectionEventsAdapter`, `function buildWsUrl(...)` from `wsUrl`.
- Consumes: `PreferencesPort` from `@rtc/domain`.

- [ ] **Step 1: Move the files with git**

```bash
git mv packages/client-react/src/app/adapters/IWsAdapter.ts packages/client-core/src/adapters/IWsAdapter.ts
git mv packages/client-react/src/app/adapters/WsConnectionEventsAdapter.ts packages/client-core/src/adapters/WsConnectionEventsAdapter.ts
git mv packages/client-react/src/app/adapters/WsConnectionEventsAdapter.test.ts packages/client-core/src/adapters/WsConnectionEventsAdapter.test.ts
git mv packages/client-react/src/app/adapters/portFactory.ts packages/client-core/src/adapters/portFactory.ts
git mv packages/client-react/src/app/adapters/portFactory.test.ts packages/client-core/src/adapters/portFactory.test.ts
git mv packages/client-react/src/app/adapters/portFactory.equities.test.ts packages/client-core/src/adapters/portFactory.equities.test.ts
git mv packages/client-react/src/app/wsUrl.ts packages/client-core/src/wsUrl.ts
git mv packages/client-react/src/app/wsUrl.test.ts packages/client-core/src/wsUrl.test.ts
mkdir -p packages/client-core/src/adapters/__tests__
git mv packages/client-react/src/app/adapters/__tests__/FakeWsAdapter.ts packages/client-core/src/adapters/__tests__/FakeWsAdapter.ts
git mv packages/client-react/src/app/adapters/__tests__/FakeWsAdapter.test.ts packages/client-core/src/adapters/__tests__/FakeWsAdapter.test.ts
git mv packages/client-react/src/app/adapters/__tests__/awaitPendingRpc.ts packages/client-core/src/adapters/__tests__/awaitPendingRpc.ts
for f in packages/client-react/src/app/adapters/wsReal*.test.ts; do git mv "$f" "packages/client-core/src/adapters/$(basename "$f")"; done
```

- [ ] **Step 2: Re-point intra-imports in the moved files**

`grep -rn "#/app/" packages/client-core/src/adapters` — re-point each to the dropped-`app/` form (e.g. `#/app/adapters/IWsAdapter` → `#/adapters/IWsAdapter`, `#/app/wsUrl` → `#/wsUrl`, `#/app/presenters/...` → `#/presenters/...`). Imports of `LocalStoragePreferencesAdapter` are removed in Step 3.

- [ ] **Step 3: Invert `portFactory` to inject `preferences` (write the failing test first)**

Add this test to `packages/client-core/src/adapters/portFactory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSimulatorPorts } from "#/adapters/portFactory";
import type { PreferencesPort } from "@rtc/domain";

describe("createSimulatorPorts dependency injection", () => {
  it("uses the injected preferences port (no internal localStorage)", () => {
    const fakePreferences = {} as PreferencesPort;
    const ports = createSimulatorPorts({ preferences: fakePreferences });
    expect(ports.preferences).toBe(fakePreferences);
  });
});
```

- [ ] **Step 4: Run the test — verify it fails**

Run: `pnpm --filter @rtc/client-core test -- portFactory`
Expected: FAIL — current `createSimulatorPorts()` takes no args / returns an internally-built preferences adapter (and the import of `LocalStoragePreferencesAdapter` from a now-missing path won't resolve).

- [ ] **Step 5: Implement the DI change in `portFactory.ts`**

- Delete the `import { LocalStoragePreferencesAdapter }` line and both `new LocalStoragePreferencesAdapter()` instantiations (was lines ~67, ~112, ~927).
- Change signatures:

```ts
export function createSimulatorPorts(deps: { preferences: PreferencesPort }): TransportPorts {
  // ...existing wiring, but use `deps.preferences` wherever the local adapter was used...
  return { /* ...other ports..., */ preferences: deps.preferences };
}

export function createWsRealPorts(
  ws: IWsAdapter,
  deps: { preferences: PreferencesPort },
): TransportPorts {
  // ...existing wiring..., 
  return { /* ...other ports..., */ preferences: deps.preferences };
}
```

- Add `import type { PreferencesPort } from "@rtc/domain";` at the top.

- [ ] **Step 6: Update the moved tests that called the old signatures**

In `portFactory.test.ts`, `portFactory.equities.test.ts`, and any `wsReal*` test that calls `createSimulatorPorts()` / `createWsRealPorts(ws)`, pass a fake: `createSimulatorPorts({ preferences: fakePreferences })` where `const fakePreferences = {} as PreferencesPort` (or a minimal in-memory fake if the test asserts on preference reads/writes — check each test's assertions and supply a stub with the methods it exercises).

- [ ] **Step 7: Extend the `client-core` barrel**

Append to `packages/client-core/src/index.ts`:

```ts
export * from "#/adapters/IWsAdapter";
export * from "#/adapters/WsConnectionEventsAdapter";
export * from "#/adapters/portFactory";
export * from "#/wsUrl";
```

- [ ] **Step 8: Run the new test — verify it passes, then the whole suite**

Run:
```bash
pnpm --filter @rtc/client-core test -- portFactory
pnpm build && pnpm typecheck && pnpm test
```
Expected: the DI test PASSES; full suite green. (`client-react`'s `WsAdapter`/`Browser*`/`LocalStorage*` still compile; they’ll be wired to the new factory signatures in Task 5.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(client-core): move portFactory + neutral adapters, inject preferences port"
```

---

## Task 5: Split `composition.ts` — neutral half to `client-core`, browser half to `client-react`

**Files:**
- Move: `packages/client-react/src/app/composition.ts` → `packages/client-core/src/composition.ts` (then strip its browser half).
- Move: `packages/client-react/src/app/__tests__/composition.boot.test.ts`, `idleTeardown.test.ts`, `layoutFactory.test.ts` → `packages/client-core/src/__tests__/` (re-point imports). If any of these asserts on `buildDefaultPorts`'s browser-adapter construction, that portion moves to the new client-react test in Step 4 instead.
- Create: `packages/client-react/src/app/buildBrowserPorts.ts` (the browser half).
- Create: `packages/client-react/src/app/__tests__/buildBrowserPorts.test.ts`.
- Modify: `packages/client-react/src/AppRoot.tsx`.

**Interfaces:**
- Produces (from `@rtc/client-core`): `createApp(ports: AppPorts): App`, `createMachineFactories(presenters: Presenters): MachineFactories`, `routeIdleLifecycle(event, ws)`, and types `App`, `Presenters`, `AppCommands`.
- Produces (in `client-react`): `function buildBrowserPorts(): AppPorts` — reads the WS URL/token env, constructs `LocalStoragePreferencesAdapter`, `BrowserConnectionEventsAdapter`, and (when a URL is configured) `WsAdapter` + `WsConnectionEventsAdapter`, then delegates to `createSimulatorPorts`/`createWsRealPorts` from `@rtc/client-core` and assembles `AppPorts`.

- [ ] **Step 1: Move `composition.ts` into `client-core` and re-point its imports**

```bash
git mv packages/client-react/src/app/composition.ts packages/client-core/src/composition.ts
git mv packages/client-react/src/app/__tests__ packages/client-core/src/__tests__
```
Re-point `grep -rn "#/app/" packages/client-core/src/composition.ts packages/client-core/src/__tests__` to dropped-`app/` paths.

- [ ] **Step 2: Strip the browser half out of `client-core/src/composition.ts`**

Remove from `composition.ts`: the imports of `WsAdapter`, `BrowserConnectionEventsAdapter`, `WsConnectionEventsAdapter`, `LocalStoragePreferencesAdapter`, and `buildWsUrl`-from-relative; remove the `buildDefaultPorts()` function (it moves to `client-react` in Step 3). Keep `createApp(ports: AppPorts)`, `createMachineFactories`, `routeIdleLifecycle`, and the `App`/`Presenters`/`AppCommands` interfaces. `createApp`'s signature loses its default — it becomes `createApp(ports: AppPorts): App` (required arg). Add `export * from "#/composition";` to `packages/client-core/src/index.ts`.

- [ ] **Step 3: Create `packages/client-react/src/app/buildBrowserPorts.ts`**

```ts
import {
  type AppPorts,
  createSimulatorPorts,
  createWsRealPorts,
  WsConnectionEventsAdapter,
  buildWsUrl,
} from "@rtc/client-core";
import { ConnectionEventsSimulator, type ConnectionEventsPort } from "@rtc/domain";
import { BrowserConnectionEventsAdapter } from "#/app/adapters/BrowserConnectionEventsAdapter";
import { LocalStoragePreferencesAdapter } from "#/app/adapters/LocalStoragePreferencesAdapter";
import { WsAdapter } from "#/app/adapters/WsAdapter";
import { resolveWsConfig } from "#/app/wsConfig"; // see note

export function buildBrowserPorts(): AppPorts {
  const preferences = new LocalStoragePreferencesAdapter();
  const { url, token } = resolveWsConfig();

  if (url) {
    const ws = new WsAdapter(buildWsUrl(url, token));
    const transport = createWsRealPorts(ws, { preferences });
    const connectionEvents: ConnectionEventsPort = new WsConnectionEventsAdapter(ws);
    return { ...transport, connectionEvents };
  }

  const transport = createSimulatorPorts({ preferences });
  const connectionEvents: ConnectionEventsPort = new ConnectionEventsSimulator();
  return { ...transport, connectionEvents };
}
```

> Port the exact env/URL-and-token resolution and the exact connection-events wiring (including any `BrowserConnectionEventsAdapter` merge and the idle-lifecycle `routeIdleLifecycle` subscription) verbatim from the original `buildDefaultPorts` body you removed in Step 2 — this snippet shows the shape; preserve the original's behavior precisely. If the original read env inline, keep that inline rather than inventing `resolveWsConfig`.

- [ ] **Step 4: Move/author the browser-ports test**

If the old `composition.boot.test.ts` asserted on `buildDefaultPorts` constructing browser adapters, move those cases into `packages/client-react/src/app/__tests__/buildBrowserPorts.test.ts`, retargeted at `buildBrowserPorts()`. Otherwise add a minimal test: with no WS URL configured, `buildBrowserPorts()` returns ports whose `connectionEvents` is a `ConnectionEventsSimulator` and whose `preferences` is a `LocalStoragePreferencesAdapter`.

- [ ] **Step 5: Rewire `AppRoot.tsx`**

Change the composition import + call:

```ts
import { createApp, createMachineFactories } from "@rtc/client-core";
import { buildBrowserPorts } from "#/app/buildBrowserPorts";
// ...
const { presenters, commands } = createApp(buildBrowserPorts());
```

(`createViewModel`/`ViewModelProvider` imports are re-pointed in Task 6. Note: `AppRoot.tsx` currently calls `createApp()` with no args — this step changes it to `createApp(buildBrowserPorts())`.)

- [ ] **Step 6: Build, typecheck, test — verify green**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: all green. Pay attention to `composition.boot.test.ts`/`idleTeardown.test.ts` now under `client-core` — they must exercise only neutral `createApp`/`routeIdleLifecycle`, not browser adapters.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: split composition into neutral createApp (client-core) + buildBrowserPorts (client-react)"
```

---

## Task 6: Move the React view-model bridge into `@rtc/react-bindings`

> **Renamed seam (post-merge):** PR #55 (ADR-004) renamed this bridge Hooks → **ViewModel** and it now lives in `packages/client-react/src/ui/viewModel/`. Files: `createViewModel.ts` (factory; exports `createViewModel` + the `ViewModel` interface), `useViewModel.ts` (`useViewModel(): ViewModel`), `useMachine.ts` (`useMachine(...)`), `ViewModelContext.ts` (`ViewModelContext`), `ViewModelProvider.tsx` (`ViewModelProvider`). None of these import the DOM; `createViewModel.ts` imports `react`/`@react-rxjs/core` (`bind`) + type-only symbols from `@rtc/domain` + presenter/composition types from `#/app/*` (now `@rtc/client-core`).

**Files:**
- Move: `packages/client-react/src/ui/viewModel/{createViewModel.ts, useViewModel.ts, useMachine.ts, ViewModelContext.ts, ViewModelProvider.tsx}` → `packages/react-bindings/src/`.
- Move tests: `createViewModel.equities.test.ts`, `useViewModel.test.tsx`, `useMachine.test.tsx` → `packages/react-bindings/src/`; `__tests__/themePreferenceHooks.test.tsx`, `__tests__/useAnimationIntents.test.tsx` → `packages/react-bindings/src/__tests__/`.
- Modify: the ~39 `useViewModel` consumer import sites in `client-react/src/ui` → `@rtc/react-bindings` (import paths vary: 37× `#/ui/viewModel/useViewModel`, plus `../viewModel/useViewModel` and `./viewModel/useViewModel` in `src/ui/App.tsx`).
- Modify: `AppRoot.tsx` (`createViewModel` + `ViewModelProvider` imports) → `@rtc/react-bindings`.
- Modify: `packages/react-bindings/package.json` — add `"@rtc/domain": "workspace:*"` (createViewModel imports domain types).

**Interfaces:**
- Produces (from `@rtc/react-bindings`): `createViewModel(presenters, machineFactories, commands): ViewModel`, interface `ViewModel`, `ViewModelProvider`, `ViewModelContext`, `useViewModel(): ViewModel`, `useMachine(...)`.
- Consumes: presenter/machine/composition types from `@rtc/client-core`; domain types from `@rtc/domain`.

- [ ] **Step 1: Add `@rtc/domain` to react-bindings deps**

In `packages/react-bindings/package.json`, add `"@rtc/domain": "workspace:*"` to `dependencies` (alphabetical: before `@react-rxjs/core` is fine — syncpack will not reorder). Add `{ "path": "../domain" }` to `references` in `packages/react-bindings/tsconfig.json`.

- [ ] **Step 2: Move the view-model files with git**

```bash
git mv packages/client-react/src/ui/viewModel/createViewModel.ts packages/react-bindings/src/createViewModel.ts
git mv packages/client-react/src/ui/viewModel/useViewModel.ts packages/react-bindings/src/useViewModel.ts
git mv packages/client-react/src/ui/viewModel/useMachine.ts packages/react-bindings/src/useMachine.ts
git mv packages/client-react/src/ui/viewModel/ViewModelContext.ts packages/react-bindings/src/ViewModelContext.ts
git mv packages/client-react/src/ui/viewModel/ViewModelProvider.tsx packages/react-bindings/src/ViewModelProvider.tsx
git mv packages/client-react/src/ui/viewModel/createViewModel.equities.test.ts packages/react-bindings/src/createViewModel.equities.test.ts
git mv packages/client-react/src/ui/viewModel/useViewModel.test.tsx packages/react-bindings/src/useViewModel.test.tsx
git mv packages/client-react/src/ui/viewModel/useMachine.test.tsx packages/react-bindings/src/useMachine.test.tsx
mkdir -p packages/react-bindings/src/__tests__
git mv packages/client-react/src/ui/viewModel/__tests__/themePreferenceHooks.test.tsx packages/react-bindings/src/__tests__/themePreferenceHooks.test.tsx
git mv packages/client-react/src/ui/viewModel/__tests__/useAnimationIntents.test.tsx packages/react-bindings/src/__tests__/useAnimationIntents.test.tsx
```

- [ ] **Step 3: Re-point imports inside the moved files**

`grep -rn "#/app/\|#/ui/" packages/react-bindings/src` — re-point every presenter/machine/composition import to `@rtc/client-core`, and any sibling view-model import to `#/<file>` (react-bindings' own `#/*`, e.g. `useViewModel` importing `ViewModelContext` → `#/ViewModelContext`). Imports of `@rtc/domain`, `react`, `@react-rxjs/core`, `rxjs` are unchanged. No import may reference `@rtc/client-react`.

- [ ] **Step 4: Author the `react-bindings` barrel** `packages/react-bindings/src/index.ts`

```ts
export * from "#/createViewModel";
export * from "#/useViewModel";
export * from "#/useMachine";
export * from "#/ViewModelProvider";
export * from "#/ViewModelContext";
```

- [ ] **Step 5: Add the `vitest.config.ts` for react-bindings (jsdom)**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["../client-react/tests/setup/jsdom-storage.ts"],
  },
});
```

> The setup file is the Node-26 localStorage shim. If a cross-package relative path trips the `../../**` Biome rule or fails to resolve, copy the shim into `packages/react-bindings/tests/setup/jsdom-storage.ts` instead and reference it locally.

- [ ] **Step 6: Re-point the ~39 `useViewModel` consumer imports in `client-react/src`**

```bash
grep -rln 'useViewModel' packages/client-react/src --include='*.ts' --include='*.tsx' | grep -v node_modules
```
In each consumer (everything except the moved files themselves), change the import — regardless of its path form (`#/ui/viewModel/useViewModel`, `../viewModel/useViewModel`, `./viewModel/useViewModel`) — to `import { useViewModel } from "@rtc/react-bindings"`. Then re-point `AppRoot.tsx`:

```ts
import { createViewModel, type ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";
```

(Collapse to a single import line if AppRoot pulls several symbols.) Add `"@rtc/react-bindings": "workspace:*"` to `packages/client-react/package.json` dependencies. After this, `packages/client-react/src/ui/viewModel/` should contain no source files — only a possibly-empty dir (removed in Task 7).

- [ ] **Step 7: Build, typecheck, test — verify green**

Run: `pnpm install && pnpm build && pnpm typecheck && pnpm test`
Expected: all green. The view-model tests now run under `@rtc/react-bindings`; `client-react` UI consumes the view model across the package boundary.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(react-bindings): move createViewModel/useViewModel/useMachine/ViewModelProvider from client-react"
```

---

## Task 7: Cleanup, dependency wiring, and full-gauntlet verification

**Files:**
- Modify: `packages/client-react/tsconfig.json` (add `references` to client-core + react-bindings).
- Remove: now-empty dirs under `packages/client-react/src/app` (e.g. `presenters/`, `layout/`, leftover `hooks/`), if empty.
- Verify: `packages/client-react/package.json` deps include both new packages; `@react-rxjs/core`/`@rx-state/core` are removed from `client-react` if no longer imported directly there.

- [ ] **Step 1: Remove emptied directories and stale dep entries**

```bash
find packages/client-react/src/app -type d -empty -delete
find packages/client-react/src/ui/viewModel -type d -empty -delete
```
Then: `grep -rn '@react-rxjs/core\|@rx-state/core' packages/client-react/src` — if there are **no** hits, remove those two entries from `packages/client-react/package.json` dependencies (they now belong to `react-bindings`/`client-core`). If there are hits, leave them. (Expect `@react-rxjs/core` to have **no** hits once `createViewModel` moves — it was the main consumer — and `@rx-state/core` likewise once presenters/machines moved in Task 3.)

- [ ] **Step 2: Add tsconfig project references in `client-react`**

In `packages/client-react/tsconfig.json`, extend `references`:

```json
"references": [
  { "path": "../domain" },
  { "path": "../shared" },
  { "path": "../client-core" },
  { "path": "../react-bindings" }
]
```

- [ ] **Step 3: Verify the workspace dependency graph / build order**

Run: `pnpm install && pnpm -w exec turbo run build --dry=json | grep -A2 client-react`
Expected: `@rtc/client-core` and `@rtc/react-bindings` appear as build-upstream of `@rtc/client-react` (Turbo derives order from workspace deps — no manual `turbo.json` change needed).

- [ ] **Step 4: Run the full local gauntlet**

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint:eslint
pnpm lint:eslint:types
pnpm lint:css
pnpm exec biome ci
pnpm --filter @rtc/client-react test:ui:contract:coverage
```
Expected: every command exits 0. Biome reports zero findings with no disables. Contract coverage stays ≥ 95%. If `biome ci` or ESLint flags the new packages, fix at the source (no inline disables).

- [ ] **Step 5: Confirm the neutrality invariants hold (guard greps)**

```bash
grep -rn "from \"react\"\|react-dom\|window\.\|document\.\|localStorage\|navigator\." packages/client-core/src && echo "LEAK in client-core" || echo "client-core clean"
grep -rn "react-dom\|@rtc/client-react" packages/react-bindings/src && echo "LEAK in react-bindings" || echo "react-bindings clean"
```
Expected: both print the "clean" branch (no matches). A match means a browser/React dependency leaked into a package that must not have it — fix before committing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: finalize client-core/react-bindings extraction; wire deps, refs, guards"
```

---

## Ship (after Task 7 green)

Follow `shipping-repo-changes`:
```bash
git push -u origin worktree-rn-expo-client-spec
gh pr create --base main --head worktree-rn-expo-client-spec \
  --title "Phase 0: extract @rtc/client-core + @rtc/react-bindings" \
  --body "Framework-neutral app-layer extraction (spec: docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md). Behavior-preserving; full suite green. Foundation for the React Native (Expo) client."
HEAD_SHA=$(git rev-parse HEAD)
gh run list --branch worktree-rn-expo-client-spec --workflow CI --json status,conclusion,headSha,databaseId --limit 5
# loop until the run for $HEAD_SHA is completed+success, then:
gh pr merge <number> --merge --subject "Merge PR #<number>: Phase 0 client-core extraction"
```

---

## Self-Review Notes (coverage of the spec)

- **Topology (spec §1):** Tasks 1–2 create `client-core` + `react-bindings`; Tasks 3–6 populate them; Task 7 wires the thin `client-react` shell. ✓
- **DI composition (spec §1 principle 1):** Task 4 (preferences injection) + Task 5 (composition split → `buildBrowserPorts`). ✓
- **Platform-scoped adapters (spec §1 principle 2):** Task 4 keeps `WsAdapter`/`Browser*`/`LocalStorage*` in `client-react`; moves `IWsAdapter`/`WsConnectionEventsAdapter`/`wsUrl` to core. ✓
- **No `react-dom` in react-bindings (spec §1, RN-readiness):** Task 2 deps + Task 7 Step 5 guard grep. ✓
- **Suite-green characterization gate (spec Phase 0 "Gate"):** every task ends on `pnpm build && typecheck && test`; Task 7 adds lint + contract-coverage. ✓
- **Out of scope (spec §5):** no Expo/RN, no `web-adapters`/`solid-bindings`, no server/domain contract changes — this plan touches only the two new packages + `client-react` internals. ✓
- **Deferred to later phases:** Expo scaffold + Metro/pnpm config (Phase 1), `SpotTile` skeleton + AsyncStorage/NetInfo adapters + EAS Update (Phase 2). Not in this plan by design.
