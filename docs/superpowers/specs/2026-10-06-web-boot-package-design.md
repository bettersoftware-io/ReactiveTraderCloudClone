# `@rtc/web-boot`: one copy of the web clients' boot code

**Date:** 2026-10-06
**Status:** design, awaiting review

## The problem

The two web clients each carry their own `src/app` folder: the browser
adapters, the port builder, the core selection, the core host and the swap
cover. Neither folder imports React or Solid outside one file each (the tree
mount). They are the same code, kept in step by hand.

Measured on `main` at `79c35603d`, React's `src/app` against Solid's:

| | files | lines |
|---|---|---|
| byte-identical | 29 | 5,979 |
| differ in comments or formatting only | 3 adapters | 204 |
| differ otherwise | `buildBrowserPorts.ts` (comments only), `devtoolsHub.ts` (the app id), 4 test files | 1,150 |
| one client only | the tree mount, its test and test probes; two tests React has and Solid lacks | about 460 |

Every fix to this code is made twice. The four PRs of 2026-10-06 (#979, #981,
#982, #983) each edited `coreHost.ts` or `buildBrowserPorts.ts` in both
clients, and each review had to check that the two copies still matched.
Nothing but review checks that.

The two `main.tsx` entry files are a second, smaller twin: about 250 lines
each, differing in about 40 (the framework imports, the tree mount, how the
swap overlay is rendered).

## The goal

One copy of the framework-free boot code, in a package both web clients
import. After the work, a client's own boot code is what differs by framework
and nothing else: its tree mount, how it renders the swap overlay, its fonts
and its devtools app id.

Success means:

1. No file under `packages/client-react/src/app` has a twin under
   `packages/client-solid/src/app`.
2. Both clients behave as before: the same unit, contract, visual and e2e
   suites pass, unchanged except for import paths.
3. `pnpm check:core-bundle` still reports each core in exactly one lazy chunk
   and none in the eager set.
4. No hand-kept twin is left that would need a drift gate.

## Why a new package, and not an existing one

- **`@rtc/shared`** is shared with the server and may not be imported by the
  UI side (`ui-never-imports-shared`). The dependency would also point the
  wrong way: this code imports `@rtc/client-adapters`, which imports `shared`.
- **`@rtc/client-adapters`** holds what every core's tests compose over and
  must not touch the DOM or import a core (`client-adapters-stays-inner`).
  This code reads `localStorage`, `window`, `matchMedia` and `document`, and
  it is the one place that reaches the three cores.
- **`@rtc/boot-splash`** and **`@rtc/layout-dockview`** are the precedent: a
  framework-free, DOM-touching package consumed by both web clients. The new
  package is their sibling.

## The spike (done, throwaway)

Question: do the three lazy core chunks survive when the `import()` calls
live in a library instead of in the client's own source?

A throwaway `@rtc/web-boot` holding only the three importers was built with
`tsc`, both clients' `coreSelection.ts` were pointed at it, and
`pnpm check:core-bundle` was run. Result: pass. Both clients built each of
`rxjs`, `async` and `effect` into exactly one lazy chunk (13.2, 12.9 and
70.4 kB gzip), with no core in the eager set. `tsc` emits the `import()`
call unchanged, and the bundler splits it the same way. The fallback (keep
the three `import()` calls in each client and pass `load` in) is not needed.

## Design

### The package

`packages/web-boot`, name `@rtc/web-boot`, built with `tsc` like
`@rtc/boot-splash`.

- **Runtime dependencies:** `@rtc/client-adapters`, `@rtc/core-api`,
  `@rtc/domain`, `@rtc/devtools-core`, `@rtc/boot-splash`, `rxjs`,
  `@rx-state/core`, and the three cores, which it reaches only through
  `import()`.
- **Never:** `react`, `react-dom`, `solid-js`, either client, either bindings
  package, `@rtc/shared`, `@rtc/ui-contract`.
- **Touches the DOM:** yes, by design.

Layout, the same as today's `src/app`:

```
packages/web-boot/src/
  index.ts
  bootApp.ts              coreHost.ts          coreSelection.ts
  coreSwapCover.ts        coreSwapView.ts      coverTimings.ts
  buildBrowserPorts.ts    startWebClient.ts    (PR 3)
  adapters/               the six browser adapters
  theme/                  MediaQueryColorSchemeAdapter
  devtools/               createDevtoolsHub, presenterManifest
```

Each file's tests move with it. One copy of each test is kept.

### What stays in each client

- `src/app/reactTreeMount.ts` / `solidTreeMount.ts` and their tests.
- `src/app/devtools/devtoolsHub.ts`: three lines that call
  `createDevtoolsHub` with the client's app id.
- `src/main.tsx`: the fonts, the framework imports and one call to
  `startWebClient`.

### Build-time values are passed in

Today the code reads `import.meta.env` in three places:
`buildBrowserPorts.ts`, `devtoolsHub.ts` and `main.tsx`. The package will not
read it. Each client reads its own Vite values in `main.tsx` and passes them:

```ts
export interface WebBootEnv {
  readonly serverUrl: string | undefined;      // VITE_SERVER_URL
  readonly demoAuth: string | undefined;       // VITE_DEMO_AUTH
  readonly devAuth: string | undefined;        // VITE_DEV_AUTH
  readonly coreImpl: string | undefined;       // VITE_CORE_IMPL
  readonly narratorTestSeam: boolean;          // DEV || VITE_NARRATOR_TEST_SEAM === "1"
  readonly dev: boolean;                       // DEV
}
```

Reasons: the package stays free of Vite, as `@rtc/boot-splash` is; its tests
pass a plain object instead of stubbing `import.meta.env`; and the node
fullstack smoke, which loads this code with no `import.meta.env`, needs no
`?.` guard.

**One behaviour changes, and it is the cost of this choice.** Today a
production build made without `VITE_NARRATOR_TEST_SEAM` has the narrator
test seam removed as dead code, because the bundler sees the literal at the
call site. With the flag passed in as a value, the seam's four relaxed
threshold numbers stay in the bundle, and the flag disables them at run
time. The page still cannot switch them on. No gate checks for the removal
today. The alternative, letting the package read `import.meta.env` itself,
keeps the removal and ties the package to Vite.

### The devtools hub

`devtoolsHub.ts` is a module-level singleton whose only difference between
the clients is the app id (`rtc-web`, `rtc-web-solid`). The package exports
`createDevtoolsHub({ appId, dev })`; each client keeps the one-line
singleton. `buildBrowserPorts` and `startWebClient` take the hub as an
argument.

### `startWebClient` (PR 3)

The framework-free part of `main.tsx` moves into one function:

```ts
export interface WebClientDeps {
  readonly rootEl: HTMLElement;
  readonly env: WebBootEnv;
  readonly devtoolsHub: DevtoolsHub;
  /** The client's tree mount. */
  readonly tree: {
    readonly unmount: () => void;
    readonly destroy: () => void;
  };
  /** Mounts the client's app tree over one composition. */
  readonly mountApp: (composition: Composition) => void;
  /** Renders the swap overlay, synchronously, into `overlayEl`. */
  readonly showOverlay: (
    overlayEl: HTMLElement,
    swap: CoreSwapView | null,
    fade: CoverTimings,
  ) => void;
}

export function startWebClient(deps: WebClientDeps): void;
```

It owns what both entry files do today in the same words: the storage
handle, the core-selection warnings, the boot-error screen and its reload
action, the devtools decorators, the motion settings, the timers, the host
and the swap follower. Each `main.tsx` shrinks to its framework's part.

This is the step that removes the last twin, so no drift gate is added.

### Rules and gates

- `web-clients-load-cores-lazily` (dependency-cruiser) is extended to
  `packages/web-boot/src`: a static import of a core there is an error.
- A new rule, `web-boot-stays-framework-free`: no `react`, `react-dom`,
  `solid-js`, client, bindings, `shared` or `ui-contract` import, matched
  with the `(^|node_modules/)` pattern.
- The package gets the standard coverage gate (lines 95%, branches 85%).
  Measured today over React's `src/app`: 98.17% lines, 97.12% branches.
- `scripts/check-manifest-drift.mts` reads the web manifest from its new
  path.
- The seven wirings a runtime package needs: `package.json` dependencies and
  tsconfig references, `knip.json`, the `tsconfig.depcruise.json` path pair,
  both `vite.config.ts` debug alias maps, the dependency-cruiser allowlists,
  and a vitest `include` that leaves `dist` out. The React Native jest map
  is not needed: the RN client does not import this package.
- The coverage report's two `app` tiers keep their names and shrink to what
  each client still owns. One tier, `web-boot`, is added.

### Out of scope

- The React Native client's `src/app`. It has its own adapters
  (`AsyncStorage`, `AppState`) and a different boot path.
- Any change of behaviour, other than the narrator seam note above.
- Renaming or restructuring the moved files.

## Delivery

Three PRs, each green on its own and each leaving both clients working.

1. **The package and the byte-identical files.** Create `@rtc/web-boot`
   with its wiring, rules and coverage gate. Move the 29 identical files
   (tests included), plus the three adapters that differ only in comments.
   Both clients import from the package. `coreSelection.ts` moves here, so
   this PR is the one that re-proves the lazy chunks.
2. **The files that differ.** `buildBrowserPorts.ts` with the env passed
   in, `createDevtoolsHub`, and the four test files reconciled into one copy
   each. Where the two clients' tests cover different cases today, the one
   copy keeps the union.
3. **`startWebClient`.** The shared part of `main.tsx`, with tests for the
   wiring that today has none because it sits in an entry file.

Each PR follows the standing regime: its own worktree, a mutation check for
every new test or rule, one independent reviewer, CI green and zero CodeQL
alerts on the head commit.

## Risks

| Risk | Guard |
|---|---|
| A core slips into the eager bundle | `check:core-bundle` in CI, and the dependency-cruiser rule on the package's source |
| A client test read its library's stale `dist` and passed on old code | Rebuild the package before judging a client test; CI builds first |
| Vite's dev server serves the package's `dist`, so an edit needs a rebuild | `pnpm dev:watch` picks the package up through the dependency graph, as it does `@rtc/boot-splash` |
| A test that differed between the clients loses a case in the merge | PR 2 lists every case in both files before merging them, and the count after is checked against the union |
| The e2e suites seed `localStorage` keys the adapters own | The keys do not change; the moved adapter tests pin them |
