# SolidJS Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second web client, `@rtc/client-solid`, rendering the entire app from the unchanged `@rtc/client-core` via a new `@rtc/solid-bindings` package, verified by the extracted framework-neutral contract suite, the existing `react/` visual golden trees, and the unchanged Gherkin behavioural suites.

**Architecture:** Three new packages. `@rtc/ui-contract` (Phase 0) receives the framework-neutral contract specs + harness + visual scenario matrix out of `client-react`. `@rtc/solid-bindings` (Phase 1) maps `StateObservable` → Solid signals via `@rx-state/core` and re-implements the ~55-member `ViewModel` with accessor returns. `@rtc/client-solid` (Phases 1–4) is the dumb Solid UI: CSS Modules and `data-*` hooks copied byte-identical, JSX rewritten per the porting recipe (Appendix A).

**Tech Stack:** TypeScript, solid-js, vite-plugin-solid, @rx-state/core 0.1.4, Vitest + @solidjs/testing-library, Playwright (+ experimental-ct-solid), CSS Modules.

**Spec:** `docs/superpowers/specs/2026-07-12-solidjs-port-design.md` — read it first.

**Refinements vs the spec** (implementation-driven):

1. `.dependency-cruiser.cjs` rules are part of the package-add checklist (the spec's §4.5 omitted them; the devtools plan is the precedent).
2. The extracted package's content all lives under `packages/ui-contract/src/` (not top-level `specs/`), because `tsconfig.eslint.json` and stylelint glob `packages/*/src/**` — anything outside `src/` silently escapes lint.
3. A **CSS/testid parity gate** (Task 12) mechanically asserts every `client-solid` `*.module.css` is byte-identical to its `client-react` counterpart — turning the spec's "copied byte-identical" rule from discipline into a failing test.
4. Pre-merge x86 golden check for Phase 4: `visual.yml` has `workflow_dispatch`, so dispatch it on the branch before merging rather than discovering x86 diffs post-merge.
5. The spec's `bindSignal(source$, default)` helper is implemented as `toSignal(state$)` — defaulting lives in the `state()` call sites (matching how react-rxjs splits `bind(source$, default)` into wrapper + read), so the helper takes an already-defaulted/warm `StateObservable`.

## Global Constraints

- Follow `.claude/skills/shipping-repo-changes` — worktree first, PR + CI green (`gh run list`, never `gh pr checks`), merge commit, cleanup. **One PR per phase** (six PRs: 0–5), full gauntlet before each PR.
- Full gauntlet: `pnpm check && pnpm lint:eslint && pnpm lint:eslint:types && pnpm lint:css && pnpm typecheck && pnpm test && pnpm check:deps && pnpm lint:dead && pnpm check:doc-links && pnpm --filter @rtc/tests gates`.
- Before merging any phase touching `src/ui`: `pnpm --filter @rtc/client-react test:ui:contract:coverage` (and from Phase 3 on, the client-solid twin) locally — the ≥95% gate is CI-enforced but cheap to check first.
- New runtime deps allowed: `solid-js` only for `solid-bindings`/`client-solid` UI code (plus workspace `@rtc/*`). No `rxjs` import ever appears under `client-solid/src/ui` (gate 34).
- Dep adds: check `pnpm outdated -r` conventions; every new dep must be ≥24h old (`minimumReleaseAge: 1440`) — pick the newest version that clears the cooldown; syncpack single-range discipline.
- Biome zero findings, no suppressions; mandatory braces; no inline `style={{…}}` (CSS Modules only; `--custom-property` writes are the only opt-out, via the existing eslint-disable pattern); `#/*` alias imports (Biome bans ≥2-up relatives) — cross-package **test** reads (goldens, parity gate) use dedicated aliases defined in the consuming config, never deep relative imports in source.
- All copy rules are byte-exact: `*.module.css`, `data-testid`/`data-*` attributes, and user-visible text are **copied, not retyped**.
- Solid components must not destructure props (kills reactivity) — `eslint-plugin-solid` recommended rules enforce.
- Commit after every green step; frequent small commits.

---

## Phase 0 — Extract `@rtc/ui-contract` (PR 1)

### Task 1: Scaffold `packages/ui-contract` and move the shared harness

**Files:**
- Create: `packages/ui-contract/package.json`
- Create: `packages/ui-contract/tsconfig.json` (references `../client-core`, `../domain`; `#/*` → `./src/*` paths)
- Move (git mv): `packages/client-react/tests/ui/contract/shared/` → `packages/ui-contract/src/shared/`
- Modify: `knip.json` (workspace entry), `.dependency-cruiser.cjs` (ui-contract may import only client-core/domain/rxjs + test libs)

**Interfaces (produced):**
- Package `@rtc/ui-contract`, private, no build output needed by consumers (they alias into `src/` directly, like the current `@ui-contract` alias does).
- `src/shared/**` keeps its internal structure verbatim: `components.ts`, `mount.ts`, `harness/{activeDriver,component,MountedComponent,world}.ts`, `pages/**`.

- [ ] **Step 1:** `package.json` — mirror `packages/devtools`-style minimal scaffold (see `packages/ws-effects/package.json` for the shape), name `@rtc/ui-contract`, deps `@rtc/client-core`, `@rtc/domain`, `rxjs` (workspace ranges via syncpack), scripts: `build` (tsc --build + tsc-alias, matching ws-effects), `typecheck": "tsc --noEmit"`, `"test": "vitest run --passWithNoTests"`, `clean`/`clean:deep` copied from ws-effects. `pnpm install` → `pnpm check:scripts` PASS.
- [ ] **Step 2:** `git mv packages/client-react/tests/ui/contract/shared packages/ui-contract/src/shared`. Fix the handful of intra-harness imports that referenced client-react paths (grep for `#tests/` and `../../` inside the moved tree; they become `#/shared/...` self-references).
- [ ] **Step 3:** knip entry (`"packages/ui-contract": { "entry": ["src/shared/components.ts", "src/shared/mount.ts"], "project": "src/**" }` — adjust entry list until `pnpm lint:dead` is clean without over-listing). dep-cruiser: forbid `packages/ui-contract/src` → any client/bindings/server package.
- [ ] **Step 4:** Run `pnpm typecheck` (workspace) — client-react now fails on the missing dir; that's expected until Task 2. Commit the move as-is only if the tree typechecks with client-react's configs updated in the same commit — otherwise fold Steps here into Task 2's commit. (Do not leave a red intermediate commit.)

### Task 2: Re-point client-react's contract configs at the new package

**Files:**
- Modify: `packages/client-react/tests/ui/contract/vitest.config.ts` (alias `@ui-contract` → `packages/ui-contract/src/shared`; `include` unchanged — specs move in Task 3)
- Modify: `packages/client-react/tests/ui/contract/vitest.coverage.config.ts`, `packages/client-react/tsconfig.ui-contract.json` (include the cross-package harness path)
- Modify: `packages/client-react/tests/ui/contract/react/*` imports of `@ui-contract/*` (should be alias-stable; verify none import `../shared/` relatively)
- Modify: `packages/client-react/package.json` (devDep `@rtc/ui-contract: workspace:*`)

- [ ] **Step 1:** Update aliases/includes as above; `@ui-contract/*` resolves into `../../node_modules/@rtc/ui-contract/src/shared/*` via the workspace symlink (import through the package name keeps Biome's relative-import ban happy).
- [ ] **Step 2:** `pnpm --filter @rtc/client-react test:ui:contract` — expect all 82 specs PASS unchanged.
- [ ] **Step 3:** `pnpm --filter @rtc/client-react test:ui:contract:coverage` — expect ≥95% (identical numbers; coverage counts `src/ui/**` only).
- [ ] **Step 4:** Commit (with Task 1's moves if held back): `refactor(ui-contract): extract framework-neutral contract harness to @rtc/ui-contract`.

### Task 3: Move the specs + visual shared matrix; finish Phase 0

**Files:**
- Move: `packages/client-react/tests/ui/contract/specs/` → `packages/ui-contract/src/specs/`
- Move: `packages/client-react/tests/ui/visual/shared/scenarios.ts` and `goldenPath.ts` → `packages/ui-contract/src/visual/`
- Modify: `packages/client-react/tests/ui/contract/vitest.config.ts` (+coverage config): point `include` at the extracted specs. Two acceptable forms — a node_modules workspace-symlink glob (`…/node_modules/@rtc/ui-contract/src/specs/**/*.contract.spec.ts`) or an absolute path built with `path.resolve` in the config file (config files are exempt from the source-import bans). Verify which form vitest 4 actually picks up and keep exactly one.
- Modify: every visual config/spec importing `shared/scenarios` or `shared/goldenPath` (grep `tests/ui/visual` for those imports) → import from `@rtc/ui-contract/src/visual/...` via a `@ui-visual` alias defined in each visual config.
- Modify: `packages/ui-contract/tsconfig.json` include picks up `src/specs` + `src/visual`; `packages/client-react/tsconfig.ui-contract.json` / `tsconfig.ui-visual.json` shrink accordingly.

- [ ] **Step 1:** `git mv` both trees; fix imports inside specs (`@ui-contract/*` alias already points at the new shared home, so spec bodies should be untouched — verify with `grep -r "\.\./" packages/ui-contract/src/specs | grep -v spec.ts:` expecting no cross-tree relatives).
- [ ] **Step 2:** `pnpm --filter @rtc/client-react test:ui:contract` → 82 PASS. `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react` → PASS (visual matrix import intact; full 3-tier run deferred to the phase gate).
- [ ] **Step 3:** Full gauntlet + `pnpm --filter @rtc/client-react test:ui:visual` (all three tiers, `RTC_VISUAL_MAX_PARALLEL=1`) — goldens must be untouched (`git status` shows no `__screenshots__` changes).
- [ ] **Step 4:** Commit; push branch `worktree-solid-phase0-ui-contract`; PR "refactor: extract @rtc/ui-contract (framework-neutral UI contract + visual matrix)"; CI loop → merge per shipping-repo-changes.

---

## Phase 1 — `@rtc/solid-bindings` + `@rtc/client-solid` scaffold (PR 2)

### Task 4: Dependency intake + `solid-bindings` scaffold

**Files:**
- Create: `packages/solid-bindings/package.json`, `tsconfig.json`, `vitest.config.ts`
- Modify: `knip.json`, `.dependency-cruiser.cjs`

**Interfaces (produced):** package `@rtc/solid-bindings`; deps `@rtc/client-core`, `@rtc/domain`, `solid-js`, `@rx-state/core`; devDeps `vite-plugin-solid`, `@solidjs/testing-library`, `jsdom`, `vitest`.

- [ ] **Step 1:** Freshness check: `pnpm outdated -r` conventions; `npm view solid-js time --json | tail -5` (and same for `vite-plugin-solid`, `@solidjs/testing-library`, `eslint-plugin-solid`, `@playwright/experimental-ct-solid`, `vitest-browser-solid`) — pick newest versions ≥24h old. Record chosen versions in the PR body.
- [ ] **Step 2:** Scaffold package (shape from `packages/react-bindings/package.json`, swapping react deps for solid). `vitest.config.ts` uses `vite-plugin-solid` + jsdom environment (mirror react-bindings' vitest setup; Solid needs the plugin for JSX in tests). Remember the Node-26 localStorage/jsdom shim if any test touches storage (`packages/client-react/tests/setup/jsdom-storage.ts` pattern).
- [ ] **Step 3:** knip entry; dep-cruiser: `solid-bindings` may import only `client-core`, `domain`, `solid-js`, `@rx-state/core`, `rxjs`; **forbid `react`** (rule `solid-stays-react-free`). Also add the mirror rule now: forbid `solid-js` from `^packages/(client-react|react-bindings)/`.
- [ ] **Step 4:** `pnpm install && pnpm check:scripts && pnpm check:deps` PASS. Commit.

### Task 5: `toSignal` + `useMachine` (TDD)

**Files:**
- Create: `packages/solid-bindings/src/toSignal.ts`, `src/useMachine.ts`
- Test: `packages/solid-bindings/src/toSignal.test.tsx`, `src/useMachine.test.tsx`

**Interfaces (produced):**
- `toSignal<T>(state$: StateObservable<T>): Accessor<T>` — subscribes immediately (StateObservables emit synchronously when warm/defaulted), disposes via `onCleanup`.
- `useMachine<TState, TIntents>(factory: () => Machine<TState, TIntents>): { state: Accessor<TState> } & TIntents`.

- [ ] **Step 1: Failing tests for `toSignal`.** Using `createRoot`/`render` from `@solidjs/testing-library`:

```tsx
import { state } from "@rx-state/core";
import { Subject } from "rxjs";
import { createRoot } from "solid-js";
import { toSignal } from "#/toSignal";

it("reads a warm value synchronously on first read", () => {
  const src = new Subject<number>();
  const st = state(src, 0);
  createRoot((dispose) => {
    const value = toSignal(st);
    expect(value()).toBe(0); // default served synchronously — no undefined frame
    src.next(42);
    expect(value()).toBe(42);
    dispose();
  });
});

it("unsubscribes on cleanup (refcount drops)", () => {
  const src = new Subject<number>();
  const st = state(src, 0);
  createRoot((dispose) => {
    toSignal(st);
    expect(st.getRefCount()).toBe(1);
    dispose();
  });
  expect(st.getRefCount()).toBe(0);
});

it("holds function-shaped state values without invoking them", () => {
  const src = new Subject<() => string>();
  const st = state(src, () => "a");
  createRoot((dispose) => {
    const value = toSignal(st);
    src.next(() => "b");
    expect(value()()).toBe("b"); // setValue(() => v) wrapper, not updater misfire
    dispose();
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @rtc/solid-bindings test` — FAIL (module not found).
- [ ] **Step 3: Implement `toSignal`:**

```ts
import type { StateObservable } from "@rx-state/core";
import { type Accessor, createSignal, onCleanup } from "solid-js";

/** StateObservable → Solid signal. Subscribes eagerly: a warm or defaulted
 * StateObservable emits synchronously inside subscribe(), so the signal is
 * seeded with the real current value before this function returns — no
 * undefined first frame (the react-rxjs bind() warm-value trap, see
 * react-bindings createViewModel.ts:539-567, is impossible by construction).
 * `equals: false`-free: default === equality is correct, presenters emit
 * fresh references. Values are written via `setValue(() => v)` because Solid
 * treats function arguments to a setter as updaters. */
export function toSignal<T>(state$: StateObservable<T>): Accessor<T> {
  let seed!: T;
  let seeded = false;
  let write: ((v: T) => void) | null = null;
  const sub = state$.subscribe((v) => {
    if (write === null) {
      seed = v;
      seeded = true;
    } else {
      write(v);
    }
  });
  if (!seeded) {
    throw new Error(
      "toSignal requires a warm or defaulted StateObservable (no synchronous emission received)",
    );
  }
  const [value, setValue] = createSignal<T>(seed);
  write = (v) => setValue(() => v);
  onCleanup(() => sub.unsubscribe());
  return value;
}
```

- [ ] **Step 4:** Tests PASS. Commit `feat(solid-bindings): toSignal — StateObservable → Solid signal`.
- [ ] **Step 5: Failing tests for `useMachine`** — port the behavioural cases of `packages/react-bindings/src/useMachine.test.tsx` (state read, intent dispatch, dispose called exactly once on unmount, no dispose while mounted) to `@solidjs/testing-library`'s `render` + `unmount`. Machines come from `@rtc/client-core` test factories the react test already uses — reuse the same fixtures.
- [ ] **Step 6: Implement:**

```ts
import type { Machine } from "@rtc/client-core";
import { type Accessor, onCleanup } from "solid-js";
import { toSignal } from "#/toSignal";

/** Per-component machine bridge. Solid components run once, so the factory
 * runs once by construction — no lazy ref. Disposal is EAGER onCleanup:
 * Solid has no StrictMode double-mount, so react-bindings' microtask-deferred
 * dispose must NOT be copied here (deferring would be a bug, not a safety
 * net). The machine's own state$ is read directly (it is already warm). */
export function useMachine<TState, TIntents extends object & { state?: never }>(
  factory: () => Machine<TState, TIntents>,
): { state: Accessor<TState> } & TIntents {
  const machine = factory();
  onCleanup(() => machine.dispose());
  return { state: toSignal(machine.state$), ...machine.intents };
}
```

- [ ] **Step 7:** Tests PASS; full package `pnpm --filter @rtc/solid-bindings test && pnpm --filter @rtc/solid-bindings typecheck`. Commit.

### Task 6: `createViewModel` — streams, commands, preferences

**Files:**
- Create: `packages/solid-bindings/src/createViewModel.ts` (the `ViewModel` interface + factory, part 1)
- Test: `packages/solid-bindings/src/createViewModel.streams.test.ts`

**Interfaces (produced):** `interface ViewModel` with the **same 55 member names** as `packages/react-bindings/src/createViewModel.ts:160-279` (keep them in the same order; copy the doc comments). Type transformation rules:
- `useX(): T` (stream read) → `useX(): Accessor<T>`
- `useX(arg): T` → `useX(arg): Accessor<T>`
- `useX(): { state: S } & I` (machine/pref bundles) → `useX(): { state: Accessor<S> } & I`; multi-field bundles like `useThemePreference` return `{ mode: Accessor<ThemeMode>, modePreference: Accessor<ThemeModePreference>, cycle(): void }` — every *read* field becomes an accessor, every intent stays a plain function.
- Command members unchanged: `useAcceptQuote(): (quoteId: number) => Promise<void>`.
- `createViewModel(presenters: Presenters, machines: MachineFactories, commands: AppCommands): ViewModel` — same signature as react.

- [ ] **Step 1: Failing tests** — mirror `createViewModel.admin.test.ts` and `createViewModel.equities.test.ts` from react-bindings (same presenter fixtures from client-core, assertions read accessors inside `createRoot`).
- [ ] **Step 2: Implement part 1.** Shared streams: `const useTradesState = state(presenters.blotter.trades$, [] as readonly Trade[])` then member `useTrades: () => toSignal(useTradesState)`. Parameterized streams use `state()`'s keyed-factory overload — the direct analogue of react-rxjs `bind((pair) => …)`:

```ts
const priceState = state(
  (pair: CurrencyPair) => presenters.priceStream.price$(pair),
  null as Price | null,
);
// member:
usePrice: (pair: CurrencyPair) => toSignal(priceState(pair)),
```

Copy the react file's defaults **exactly** (they encode behaviour: e.g. `useBootGate`'s default must be `presenters.bootGate.visible`, not `true` — same comment applies). Commands are verbatim copies of the react implementations (`firstValueFrom` wrappers, stable functions).
- [ ] **Step 3:** Tests PASS. Commit `feat(solid-bindings): ViewModel streams/commands/preferences`.

### Task 7: `createViewModel` — machines + context/provider; barrel

**Files:**
- Modify: `packages/solid-bindings/src/createViewModel.ts` (machine-backed members)
- Create: `src/ViewModelContext.ts`, `src/ViewModelProvider.tsx`, `src/useViewModel.ts`, `src/index.ts`
- Test: `src/createViewModel.bootGate.firstRender.test.tsx`, `src/createViewModel.eqWorkspace.firstRender.test.tsx`, `src/useViewModel.test.tsx`

**Interfaces (produced):** barrel exports exactly `createViewModel, useMachine, useViewModel, ViewModelContext, ViewModelProvider` (same names as react-bindings' `index.ts`).

- [ ] **Step 1:** Machine members delegate to `useMachine` exactly as react does (`useTileExecution: (pair) => useMachine(() => machines.tileExecution(pair))`, `.state` unwrap for flag machines is now `.state` accessor — flag members return `Accessor<boolean>` directly: `useStaleFlag: (pair) => useMachine(() => machines.staleFlag(pair)).state`). `useEqWorkspace` reads `presenters.eqWorkspace.state$` via `toSignal` directly (it is warm by construction; the react file's giant comment explains why — summarize it in one line and cite the react file).
- [ ] **Step 2:** Context/provider/useViewModel — Solid `createContext<ViewModel>()`; `useViewModel()` throws if missing provider (match react's behaviour).
- [ ] **Step 3:** Port the two first-render regression tests (boot-gate visible-from-construction; eqWorkspace warm value on first read) — these are the tests that pin the warm-value semantics the spec calls out as Risk 1.
- [ ] **Step 4:** `pnpm --filter @rtc/solid-bindings test` all green; gauntlet-relevant subset (`typecheck`, `lint:eslint`, `check:deps`, `lint:dead`). Commit.

### Task 8: `@rtc/client-solid` scaffold + walking skeleton

**Files:**
- Create: `packages/client-solid/package.json`, `vite.config.ts`, `index.html`, `tsconfig.json`, `tsconfig.node.json`
- Create: `packages/client-solid/src/main.tsx`, `src/AppRoot.tsx`, `src/App.tsx` (skeleton: connection status only), `src/index.css`
- Copy verbatim: `src/app/buildBrowserPorts.ts`, `src/app/adapters/{LocalStoragePreferencesAdapter,BrowserConnectionEventsAdapter}.ts`, `src/app/theme/MediaQueryColorSchemeAdapter.ts`, `src/bootSplashGate.ts` (+ its test) from `packages/client-react/src/`
- Modify: root `package.json` (`"dev:solid": "pnpm --filter @rtc/client-solid dev"`), `knip.json`, `.dependency-cruiser.cjs`, `eslint.config.mjs` + `eslint.config.typed.mjs` (client-solid scoped dumb-UI blocks mirroring the client-react entries at `eslint.config.mjs:143-182`, plus `eslint-plugin-solid` recommended for `packages/client-solid/**` and `packages/solid-bindings/**`), `tests/scripts/grep-gates.ts` (gates 34–37)

**Interfaces (produced):** dev server on port **5473** (`pnpm dev:solid`); `AppRoot` mounts `createApp(buildBrowserPorts())` once, provides the ViewModel; `App` renders a `data-testid="connection-status"` element driven by `useConnectionStatus()`.

- [ ] **Step 1:** Scaffold configs — `vite.config.ts` with `vite-plugin-solid`, port 5473; package.json mirrors client-react's shape minus react deps (deps: `@rtc/client-core`, `@rtc/domain`, `@rtc/motion-core`, `@rtc/solid-bindings`, `solid-js`, the five `@fontsource/*` packages; NO `rxjs` — the UI never sees it; motion stays out until a component needs it, then match client-react's usage).
- [ ] **Step 2:** Copy the app-layer files byte-identical (only change permitted: none — they are framework-free; `import.meta.env` works under Vite for both). Copy their colocated tests too.
- [ ] **Step 3:** `AppRoot.tsx`:

```tsx
import { createApp } from "@rtc/client-core";
import { createMachineFactories } from "@rtc/client-core";
import { createViewModel, ViewModelProvider } from "@rtc/solid-bindings";
import type { ParentProps } from "solid-js";
import { buildBrowserPorts } from "#/app/buildBrowserPorts";

export function AppRoot(props: ParentProps) {
  const { presenters, commands } = createApp(buildBrowserPorts());
  const viewModel = createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );
  return (
    <ViewModelProvider viewModel={viewModel}>{props.children}</ViewModelProvider>
  );
}
```

(Verify `createApp`'s exact return shape against `client-core`'s composition root and match the react `AppRoot.tsx:27-46` call sequence — including the boot-splash gate seeding — before writing; the react file is the source of truth.)
- [ ] **Step 4:** Gates 34–37 in `tests/scripts/grep-gates.ts`: clone the 26–29 block (`grep-gates.ts:411-436`) with `../packages/client-solid/src/ui/` paths; gate 38/39 cross-framework bans if not already covered by dep-cruiser (dep-cruiser rule from Task 4 covers imports; grep gates are belt-and-braces — add only 34–37 here).
- [ ] **Step 5:** `pnpm dev:solid` → open http://localhost:5473 — skeleton renders live connection status from the simulator ports. `pnpm gates` (from tests pkg) PASS; full gauntlet PASS. Commit; PR "feat(solid): @rtc/solid-bindings + client-solid walking skeleton"; CI loop → merge.

---

## Phase 2 — Shell + FX + the `solid/` swap-trio (PR 3)

> Porting recipe for every component task: **Appendix A**. Source of truth is always the react file at the same path under `packages/client-react/src/ui/`.

### Task 9: Shell subtree, part 1 — theme, chrome, boot (≈17 of 33 files)

**Files:**
- Create: `packages/client-solid/src/ui/shell/` ports of: ThemeProvider + skin plumbing, top bar/status bar/nav tabs, boot sequence + splash + scenes, session lock. Exact file list: `ls packages/client-react/src/ui/shell/` and take everything except the layout-engine cluster (deferred to Task 10).
- Copy: every corresponding `*.module.css` byte-identical.

- [ ] **Step 1:** Port per recipe; wire into `App.tsx` progressively (tabs render placeholder panels for not-yet-ported subtrees — a plain `<div data-testid="pending-panel" />`).
- [ ] **Step 2:** Visual smoke: `pnpm dev:solid`, click through all tabs/skins/boot reboot. Fix obvious breaks now; goldens come in Phase 4.
- [ ] **Step 3:** Commit per component cluster (theme, chrome, boot — three commits minimum).

### Task 10: Shell subtree, part 2 — layout engine hosts (+ remaining shell files)

**Files:**
- Create: the layout-engine component cluster (`useLayout`-driven grid, panel chrome, drag/resize shells) under `packages/client-solid/src/ui/shell/`.

- [ ] **Step 1:** Port per recipe. The layout machine is `client-core`; only DOM measurement/pointer plumbing is rewritten. Where client-react uses `@rtc/motion-core` pure functions with a React shell, write the Solid shell over the **same** pure functions (ADR-005 pattern — the pure math is already framework-free).
- [ ] **Step 2:** Manual verify drag/resize/collapse in `pnpm dev:solid` on the FX tab (tiles can still be pending placeholders).
- [ ] **Step 3:** Commit.

### Task 11: The `solid/` swap-trio + contract config

**Files:**
- Create: `packages/client-solid/tests/ui/contract/solid/setup.ts`, `render.tsx`, `registry.tsx`, `viewModelFromWorld.ts`, `PropsHost.tsx`, plus Solid ports of the aux hosts (`AnimationProbe`, `LayoutEngineHost`, `pinnedFixtureLayoutPort` — copy the pinned-fixture data verbatim)
- Create: `packages/client-solid/tests/ui/contract/vitest.config.ts` (+ `vitest.coverage.config.ts` with the same 95/95/95/95 thresholds over `src/ui/**`)
- Create: `packages/client-solid/tsconfig.ui-contract.json`
- Modify: `packages/client-solid/package.json` (scripts `test:ui:contract`, `test:ui:contract:coverage`; devDeps `@rtc/ui-contract`, `@solidjs/testing-library`)

**Interfaces (consumed):** `UiContractDriver` from `@rtc/ui-contract` (`shared/harness/activeDriver.ts`) — implement `render()` returning `{ root, unmount, flushSync }`.

- [ ] **Step 1:** `render.tsx`: Solid `render()` into a detached container appended to `document.body`, provider stack mirroring the react driver (`ViewModelProvider → ThemeProvider → FxViewProvider/CreditViewProvider equivalents → PropsHost`). `flushSync: (fn) => fn()` — Solid commits synchronously; keep the wrapper so the driver contract is honoured.
- [ ] **Step 2:** `viewModelFromWorld.ts`: for each World-seeded member, wrap the World's controllable value stream in `state(...)` + `toSignal` — study the react adapter's member-by-member mapping and produce the accessor-returning equivalents. `PropsHost.tsx`: `const [props, setProps] = createSignal(initial)` driven by the World's propsSubject.
- [ ] **Step 3:** `registry.tsx`: entries for every component ported so far (shell + the FX ones as Task 12 lands them — this task lands with the shell entries and the config wired).
- [ ] **Step 4:** Run: `pnpm --filter @rtc/client-solid test:ui:contract -- --dir ../ui-contract/src/specs/shell` (or vitest `-t` filtering — pick the mechanism that runs shell specs only) → shell specs PASS.
- [ ] **Step 5:** Commit `test(solid): UI-contract solid swap-trio + shell specs green`.

### Task 12: CSS/testid parity gate

**Files:**
- Create: `packages/client-solid/tests/parity/cssParity.test.ts`

- [ ] **Step 1:** A vitest test that (a) walks `packages/client-react/src/ui/**/*.module.css` and asserts, for every file whose component has been ported (i.e. the Solid twin path exists), byte equality with the client-solid copy; (b) once Phase 3 completes, flips to assert the **file sets are identical** (a `PARITY_COMPLETE` const flipped in Task 16). Use `node:fs` reads with paths resolved from the package root — this is a test file, cross-package reads are fine.
- [ ] **Step 2:** Test passes for the shell files; commit.

### Task 13: FX subtree (32 tsx: liveRates, tiles, blotter, RFQ aside)

**Files:**
- Create: `packages/client-solid/src/ui/fx/**` ports (full subtree)
- Modify: `packages/client-solid/tests/ui/contract/solid/registry.tsx` (FX entries), `src/App.tsx` (FX tab live)

- [ ] **Step 1:** Port per recipe, in the order: liveRates grid + tiles → execution flow → blotter → RFQ aside. Commit per cluster.
- [ ] **Step 2:** FX contract specs green (`test:ui:contract` filtered to `specs/fx`). Parity gate green.
- [ ] **Step 3:** Full contract run (shell+fx; credit/equities/admin specs will fail on missing registry entries — verify the runner can exclude them per-directory for this phase, e.g. config `exclude` listing the three pending spec dirs, removed in Phase 3).
- [ ] **Step 4:** Full gauntlet; `pnpm dev:solid` manual pass on FX (tiles price, execute, blotter fills, RFQ flow). Commit; PR "feat(solid): shell + FX + contract swap-trio"; CI loop → merge.

---

## Phase 3 — Credit, Equities, Admin (PR 4; Tasks 14–16 run as parallel subagents)

### Task 14: Credit subtree (16 tsx)
### Task 15: Equities subtree (22 tsx)
### Task 16: Admin subtree (14 tsx)

**Each of 14–16, identically structured — Files:**
- Create: `packages/client-solid/src/ui/<domain>/**` (full port per recipe)
- Modify: `registry.tsx` (domain entries), `App.tsx` (tab live), contract config `exclude` list (remove own domain)

- [ ] **Step 1:** Port per recipe; commit per cluster.
- [ ] **Step 2:** Domain contract specs green; parity gate green.
- [ ] **Step 3:** Manual dev-server pass on the tab.

(Parallelization note: the three subtrees are disjoint; registry/App/exclude-list edits collide — each subagent owns ONLY its `src/ui/<domain>` tree and hands back a patch list for the three shared files, which the orchestrator applies serially. Task 16 additionally flips `PARITY_COMPLETE` in the parity gate.)

### Task 17: Coverage gate on + CI step

**Files:**
- Modify: `.github/workflows/ci.yml` (`checks` job: step "UI contract coverage gate — solid (≥95%)" → `pnpm --filter @rtc/client-solid test:ui:contract:coverage`, next to the react step at `ci.yml:103-104`)

- [ ] **Step 1:** Full unfiltered contract run: all 82 specs PASS against Solid. Coverage: ≥95% on `client-solid/src/ui` — port gap-filler: if under, the uncovered lines are components the specs never mount; check the react coverage config's exclude list and mirror it (canvas/full-page roots are excluded there too).
- [ ] **Step 2:** Full gauntlet + both coverage gates locally. Commit; PR "feat(solid): credit + equities + admin — full contract parity"; CI loop → merge.

---

## Phase 4 — Visual parity (PR 5)

### Task 18: vitest-browser tier

**Files:**
- Create: `packages/client-solid/tests/ui/visual/vitest-browser/vitest-browser.config.ts` + host/spec files (mirror the react tier's structure; scenario matrix imported from `@rtc/ui-contract`)
- Modify: `packages/client-solid/package.json`: script `test:ui:visual:vitest-browser:solid`

- [ ] **Step 1:** Config points `resolveSnapshotPath`/snapshot dir **cross-package** at `packages/client-react/tests/ui/visual/vitest-browser/__screenshots__/<react|react-local/arch>` (CI/local branch logic copied from the react config). **No `:update` script is created** — assert-only by construction.
- [ ] **Step 2:** Fonts: replicate the react tier's `loadFonts.ts` + `document.fonts.load` force-load verbatim (webfont race, PRs #156/#161).
- [ ] **Step 3:** Run vs `react-local/<arch>` set; fix fidelity diffs (CSS is byte-identical, so diffs mean DOM structure/attribute drift — fix the component, never the golden).

### Task 19: playwright full-page + playwright-ct tiers

**Files:**
- Create: `packages/client-solid/tests/ui/visual/playwright/playwright.config.ts` (+ host wiring for the solid dev/preview server), `playwright-ct/playwright-ct.config.ts` (using `@playwright/experimental-ct-solid`; if intake in Task 4 found it unusable, fall back to full-page playwright covering the ct scenarios via the shared matrix — decide once, document in the config header)
- Create: `packages/client-solid/tests/ui/visual/run-all.ts` (copy client-react's, it filters this package's own 5-part scripts)
- Modify: scripts `test:ui:visual`, `test:ui:visual:playwright:solid`, `test:ui:visual:playwright-ct:solid`

- [ ] **Step 1:** `snapshotPathTemplate` → client-react's `__screenshots__` trees (CI `react/`, local `react-local/<platform>-<arch>/`), assert-only.
- [ ] **Step 2:** Replicate every determinism pin from the react hosts (fixture layout port, animation probe, boot-scene pinning, font force-load). Run each tier with `RTC_VISUAL_MAX_PARALLEL=1`.

### Task 20: Fidelity loop + pre-merge x86 verification

- [ ] **Step 1:** `pnpm --filter @rtc/client-solid test:ui:visual` until green locally (arm64 set).
- [ ] **Step 2:** Push branch; `gh workflow run visual.yml --ref <branch>` → loop `gh run list --workflow visual.yml` until the x86 `react/`-tree run for the branch is green.
- [ ] **Step 3:** Full gauntlet; PR "feat(solid): visual parity — all three tiers vs canonical react goldens"; CI loop → merge (visual.yml post-merge run is the backstop).

---

## Phase 5 — E2E + CI + docs (PR 6)

### Task 21: Dev-server parameterization + solid e2e suites

**Files:**
- Modify: `tests/scripts/devServer.ts` (`RTC_CLIENT_PKG`, default `@rtc/client-react` — the `spawn("pnpm", ["--filter", …])` at the single hardcoded site)
- Modify: `tests/scripts/run-all.ts` (solid browser-suite entries; solid port block starts after the react block — read `BROWSER_BASE_PORT` handling at `run-all.ts:43,68-74` and extend, don't fork)

- [ ] **Step 1:** Parameterize; react suites unchanged (`pnpm test:e2e` still green before adding solid entries).
- [ ] **Step 2:** Add solid entries (Playwright driver; Cypress stays react-only on Mac-host per its de-gated status). `pnpm test:e2e` → all react + solid suites green. The Gherkin features/steps/POs are untouched — any solid failure is a client bug (missing testid → check parity gate first).
- [ ] **Step 3:** Commit.

### Task 22: CI + turbo + workflows sweep

**Files:**
- Modify: `.github/workflows/ci.yml` (verify e2e job picks up solid suites via `test:e2e`; nothing else should need declaring — turbo tasks are name-keyed), `.github/workflows/visual.yml` (verify `pnpm test:ui:visual` turbo-fans to client-solid; header comment scenario count update)

- [ ] **Step 1:** Audit each workflow for react-only assumptions (`grep -n "client-react" .github/workflows/*.yml`) — extend or explicitly leave (deploy workflows stay react-only by design: no solid deployment this workstream).
- [ ] **Step 2:** Commit.

### Task 23: Docs sync

**Files:**
- Modify: `docs/architecture/08-replaceability-matrix.md` (§8.1 planned→shipped; cost row "empirically calibrated" note for the bindings), `docs/architecture/06-package-dependencies.md` (graph +3 packages), `docs/architecture/13-codebase-map.md`, `docs/architecture/02-c4-model.md` + `03-uml-class-diagrams.md` (client-solid where client-prototype/RN appear), `CLAUDE.md` (package table, `dev:solid`, package count), `framework-swap.svg` caption if it says "planned"
- Create: `packages/{ui-contract,solid-bindings,client-solid}/README.md` (match the nine existing package READMEs' structure)

- [ ] **Step 1:** Write; `pnpm check:doc-links` green (heading anchors via real github-slugger rules; diagrams tall-not-wide per CLAUDE.md).
- [ ] **Step 2:** Full gauntlet; final whole-branch review (fresh reviewer over the entire phase-5 diff); PR "feat(solid): e2e + CI symmetry + docs — SolidJS port complete"; CI loop → merge.

---

## Appendix A — Component porting recipe (every Phase 2/3 task)

Per component, in order:

1. **Read** the react file `packages/client-react/src/ui/<path>.tsx` fully, and its `*.module.css` + colocated test if any.
2. **Copy** the `*.module.css` byte-identical (`cp`, never retype). The parity gate (Task 12) enforces this.
3. **Rewrite** the `.tsx` mechanically:
   - `className={styles.x}` → `class={styles.x}`; `htmlFor` → `for`.
   - `items.map((it) => <Row key={it.id} …/>)` → `<For each={items()}>{(it) => <Row …/>}</For>` (no keys).
   - `{cond ? <A/> : <B/>}` → `<Show when={cond()} fallback={<B/>}><A/></Show>`; `{cond && <A/>}` → `<Show when={cond()}><A/></Show>`.
   - ViewModel reads become accessor calls at **use sites**: `const price = vm.usePrice(props.pair)` then `price()` in JSX — never call the accessor at component top level and store the value.
   - Props: **no destructuring** (eslint-plugin-solid enforces); use `props.x`, `splitProps` where the react code spread rest-props.
   - Delete `memo`, `useCallback`, `useMemo` + dep arrays. `useMemo(fn, deps)` with real computation → `createMemo(fn)`. `useEffect` → `createEffect`/`onMount` + `onCleanup` (rare — dumb components mostly have none; if one has meaningful `useEffect` logic, stop and check ADR-005 whether it should be a machine or a motion-core pure fn instead of porting it literally).
   - `useRef` for DOM → `let el!: HTMLDivElement` + `ref={el}`; `dangerouslySetInnerHTML` → `innerHTML` prop.
   - Portals → `<Portal>` from `solid-js/web`.
   - Every `data-testid`/`data-*`/aria attribute and user-visible string: copied exactly.
4. **Register** the component's token in `registry.tsx` if the react registry has it.
5. **Run** its contract specs; then the parity gate.
6. **Commit** per component cluster (not per file).

JSX text note: literal glyphs, never `\uXXXX` escapes (repo-wide rule; same trap exists in Solid JSX).

## Verification ladder (memorize)

component: contract specs → subtree: domain spec dir green → phase: full gauntlet + coverage gates → visual: 3 tiers vs react goldens (`RTC_VISUAL_MAX_PARALLEL=1`) → e2e: Gherkin suites → CI: `gh run list` loop → post-merge: visual.yml.
