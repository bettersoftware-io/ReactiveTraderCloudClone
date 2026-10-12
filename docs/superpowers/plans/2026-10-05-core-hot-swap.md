# Application-Core Hot Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the running web client from one application core to another without a page reload, over the same ports, behind a short branded overlay, with Preferences open again on the new core.

**Architecture:** A framework-free **core host** in each web client owns the ports (built once per page) and the running composition. `swapTo(impl)` covers the page, loads the new chunk, unmounts the UI, disposes the old core, ends the devtools hub's composition, composes the new core over the same ports and mounts the UI again. The cores gain two contract obligations (recomposition over used ports, a flushed layout write on dispose); the devtools hub gains `endComposition()`.

**Tech Stack:** TypeScript, RxJS (`BehaviorSubject` for the host's state), React 19 (`flushSync`) / SolidJS (`render` disposer), vitest fake timers, `@rtc/core-contract`, `@rtc/ui-contract`, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-05-core-hot-swap-design.md](../specs/2026-10-05-core-hot-swap-design.md)

## Global Constraints

- **The same port objects serve every composition of a page.** `buildBrowserPorts()` runs once per page, in the entry file, never in `AppRoot`.
- **Swap order is fixed:** cover → load → unmount → one macrotask → `await old.dispose()` → `devtoolsHub.endComposition()` → compose → mount → publish → lift.
- **No silent fallback.** A failed chunk load leaves the old core running and reports through `CoreSelection.failure$`. A failed `createApp` recomposes the previous core. A second failure renders `renderBootError`.
- `<html data-core-impl>` names the core that is actually composed. The console line after a swap is `[core] swapped <from> to <to>`.
- A successful swap saves the choice (`saveCoreChoice`) and removes `?core=` with `history.replaceState`. `select` never navigates.
- The boot splash plays at most once per page.
- React Native is unchanged: it passes no `coreSelection`, never calls `endComposition`, and its `ViewModelShell` omissions stay legal.
- `src/ui` stays dumb: no `localStorage`, `location`, `history` or `import.meta.env` there (grep gates 27/28/35/36). The host and entry files own those.
- `@rtc/core-api` stays types-only (grep gate 42).
- No web client imports a core statically (`web-clients-load-cores-lazily`); `pnpm check:core-bundle` stays green unchanged.
- Overlay CSS follows `docs/performance.md`: animate `opacity` only, no `filter` / `backdrop-filter`, no `var()` in an animated transform. Read that document before writing the stylesheet.
- Timer-driven outcomes are tested on fake timers; the host takes its `sleep` and `nextMacrotask` as dependencies.
- Every new test is mutation-checked (`node scripts/mutation-check.mts <spec.json>`). Gate the FINAL tree of each PR. One independent reviewer per PR; its Minors are fixed in the same PR.
- One worktree per PR (`./scripts/new-worktree.sh <name> --ready`). Outward steps (push, PR create, merge) are each their own Bash call.
- Twin files: `coreHost.ts`, `coreHost.test.ts` and `coreSelection.ts` are kept identical in `client-react` and `client-solid` apart from framework imports.

## Review Focus

1. **A swap while the connection is down or reconnecting.** The new core must show what a fresh composition would show in the same condition, not a stale "connected". Pinned by Task 9's "matches fresh ports" cases.
2. **A swap with a Dockview panel floated or popped out.** The remount restores what a reload restores and leaves no orphan window. Pinned by Task 11's e2e step, with a manual browser check recorded in the PR.
3. **A swap seconds after a layout change.** Pinned by Task 3's `dispose` flush case and Task 11's e2e step.
4. **A swap with an inspector attached.** No stale stream, no duplicate live machine, the old core not kept alive. Pinned by Task 5's `InspectorStore` case and Task 7's step-order case.
5. **Selecting twice quickly, or while offline.** One swap, or a failure line, never a blank page. Pinned by Task 7's re-entrancy and load-failure cases.

---

## PR 2 — the cores tolerate recomposition (worktree `hot-swap-cores`)

### Task 1: `CoreHarness.recompose`

**Files:**
- Modify: `packages/core-contract/src/harness/harness.ts`
- Modify: `packages/client-core-rxjs/src/composition.coreContract.test.ts`, `packages/client-core-async/src/coreContract.test.ts`, `packages/client-core-effect/src/coreContract.test.ts`
- Create: `packages/core-contract/src/suites/sessionKit.ts` (moves `signIn` and `everySessionStream` out of `suites/dispose.ts`, unchanged, so both suites share them)

**Interfaces — Produces:**

```ts
export interface CoreHarness {
  app: App;
  machines: MachineFactories;
  driver: ScriptedDriver;
  /** Disposes the running app and composes a new one over the SAME ports,
   * as a hot swap does. Resolves to the new app; `teardown` disposes it. */
  recompose(): Promise<App>;
  teardown(): Promise<void>;
}
```

Each runner keeps a `let current = app` and implements:

```ts
recompose: async () => {
  await current.dispose();
  current = createApp(ports);
  return current;
},
teardown: async () => {
  await current.dispose();
  teardown();
},
```

- [ ] Step 1: add `recompose` to the interface; run `pnpm typecheck` — expect three errors, one per runner.
- [ ] Step 2: implement it in the three runners; move the two helpers to `sessionKit.ts`.
- [ ] Step 3: `pnpm --filter @rtc/core-contract test` and the three cores' `coreContract` runs — all green, no case count change.
- [ ] Step 4: commit `test(core-contract): CoreHarness.recompose and a shared session kit`.

### Task 2: the `recomposition` suite

**Files:**
- Create: `packages/core-contract/src/suites/recomposition.ts`
- Modify: `packages/core-contract/src/index.ts` (export `describeRecompositionContract`; call it from `describeCoreContract` after `describeDisposeContract`)

**Cases** (each under `withFakeClock`, seed `{ transport: true, countPortStreams: true }` unless noted):

| # | Name | Key assertions |
|---|---|---|
| 1 | a second composition over the same ports resumes the session without a login | sign in on A; `b = await h.recompose()`; first collected `b.presenters.auth.state$` value has `status === "authenticated"`; `h.driver.pendingLogins()` is empty; `h.driver.transportCalls()` equals `["disconnect", "connect", "connect"]` |
| 2 | a second composition calls each port method as often as a first | for each name in a `PORT_METHODS` list taken from the `portDiscipline` suite's names: `first = portCalls(name)` is at least 1 (positive witness); after `recompose()`, `portCalls(name) === first * 2` |
| 3 | values the ports emit after the swap reach the second composition | after `recompose()`, collect `b.presenters.blotter.trades$` and `b.presenters.priceStream.price$(EURUSD)`; `driver.emitTrades([...])`, `driver.tickPrice(...)`; both collected |
| 4 | a warm second composition holds as many port subscriptions as a warm first | warm `everySessionStream(a)`, record `n = livePortSubscriptions()` (positive witness `n > 0`), release, `recompose()`, warm `everySessionStream(b)`; `livePortSubscriptions() === n` |
| 5 | after the second composition's dispose() no port stream stays subscribed | as 4, then release, `await b.dispose()`, settle; `livePortSubscriptions() === 0` |
| 6 | a preference changed before the swap is what the second composition starts from | cycle the theme on A; after `recompose()` the first `b.presenters.themePreference.mode$` value is the cycled one |

- [ ] Step 1: write the suite; run each core's runner. Expected: green, per the probes. Any red case is a real finding: fix the core under superpowers:systematic-debugging in this PR.
- [ ] Step 2: mutants (in `scratchpad/hotswap/mutants-cores.json`), each expected RED by the named case:
  - RxJS `createApp`: drop `held.add(gateTransportOnAuth(...))` → case 1.
  - `recompose` in one runner composes over fresh ports (rebuild `scriptPorts`) → cases 1 and 6.
  - RxJS `dispose`: skip `disposed$.next()` → case 4 (leaked warm singletons).
  - async `dispose`: skip `lifetime.abort()` → case 4.
  - effect `dispose`: skip `closeScopeAndWait` → case 4.
- [ ] Step 3: commit `test(core-contract): recomposition suite — a core can be composed over used ports`.

### Task 3: `dispose()` flushes a pending workspace write

**Files:**
- Modify: `packages/core-contract/src/suites/dispose.ts` (one case)
- Modify: `packages/client-core-rxjs/src/layout/workspacePersistenceWriter.ts`
- Modify (if the case is red there): `packages/client-core-async/src/presenters/workspace.ts` (`createPersistDebounce`), `packages/client-core-effect/src/presenters/workspace.ts`

**Case:** "dispose() writes a workspace-layout change still inside the persistence debounce". Drive the same layout intent `suites/layout.ts:170` uses; `await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS - 1)`; positive witness that `driver.storedWorkspaceLayout()` is still the seed value; `await h.app.dispose()`; expect `storedWorkspaceLayout()` to carry the change.

**RxJS fix** — the writer tracks a pending kick and writes it on teardown:

```ts
export function createWorkspacePersistenceWriter(
  deps: WorkspacePersistenceWriterDeps,
): Subscription {
  let pending = false;

  function writeNow(): void {
    pending = false;
    writeWorkspaceLayout(deps);
  }

  const subscription = deps.kick$
    .pipe(
      tap(() => {
        pending = true;
      }),
      debounceTime(deps.debounceMs ?? WORKSPACE_PERSIST_DEBOUNCE_MS),
    )
    .subscribe(writeNow);

  subscription.add(() => {
    if (pending) {
      writeNow();
    }
  });

  return subscription;
}
```

`held.unsubscribe()` runs first in `dispose`, while the layout machines are still alive, so the write reads live state. Async and Effect get the equivalent: the debounce exposes a `flush()` that `dispose` calls before the abort / scope close.

- [ ] Step 1: write the case; run all three runners; record which are red (RxJS expected red).
- [ ] Step 2: fix each red core; rerun — green. Also rerun `suites/layout.ts` cases (the debounce behaviour itself must not change).
- [ ] Step 3: mutants: remove the teardown write in each fixed core → this case RED.
- [ ] Step 4: commit `fix(cores): dispose() writes a pending workspace layout change`.

### Task 4: gate, review, ship PR 2

- [ ] `/rtc:gauntlet full` on the final tree; mutation spec all killed; one reviewer; fix Minors; push; PR; CI green on head; CodeQL 0 open; merge with `--merge`; ancestor check; remove worktree.

---

## PR 3 — the devtools hub (worktree `hot-swap-hub`)

### Task 5: `DevtoolsHub.endComposition()`

**Files:**
- Modify: `packages/devtools-core/src/DevtoolsHub.ts`, `packages/devtools-core/src/DevtoolsHub.test.ts`
- Modify: `docs/architecture/20-devtools.md`

**Interfaces — Produces:**

```ts
/** Ends the composition whose presenters and machines are registered: every
 * stream is unsubscribed and forgotten, so the next `registerStream` with
 * the same id takes the new composition's source, and every machine still
 * live is reported disposed. An attached inspector gets a fresh welcome +
 * snapshot on the next flush, once the next composition has registered. */
endComposition(): void {
  for (const entry of this.streams.values()) {
    entry.sub?.unsubscribe();
  }

  this.streams.clear();
  this.pendingStreams.clear();

  for (const [machineId, entry] of this.machines) {
    if (!entry.disposed) {
      this.machineDisposed(machineId);
    }
  }

  this.resnapshotDue = this.isLive;
}
```

`flush()` starts with: `if (this.resnapshotDue) { this.resnapshotDue = false; this.sendWelcomeAndSnapshot(); }`. `goDormant()` clears the flag.

**Cases:**

1. live hub: after `endComposition()`, `registerStream("x", newSource$)` subscribes the new source (an emission reaches the next batch) and the old source has no subscriber (`oldSubject.observed === false`).
2. dormant hub: `endComposition()` then a `hello` subscribes only the new registrations.
3. every live machine is reported disposed; an already disposed one is not reported twice.
4. a live inspector receives `welcome` then `snapshot` on the next flush, listing exactly the new composition's stream ids.
5. no inspector attached: no message is sent, and the call is a no-op on an empty hub.
6. integration: the messages of case 4 fed into a real `InspectorStore` leave no stream from the first composition and no live machine from it.

- [ ] Step 1: write cases 1–6 — RED (`endComposition` is not a function).
- [ ] Step 2: implement; GREEN.
- [ ] Step 3: mutants: drop `this.streams.clear()` → case 1; drop the machine loop → case 3; drop the `resnapshotDue` flush → cases 4 and 6; set `resnapshotDue = true` unconditionally → case 5.
- [ ] Step 4: `pnpm --filter @rtc/devtools-core test:coverage` (≥95% gate); doc paragraph in §20; commit `feat(devtools-core): DevtoolsHub.endComposition`.

### Task 6: gate, review, ship PR 3 (as Task 4)

---

## PR 4 — the core host and the swap (worktree `hot-swap-host`)

### Task 7: `coreHost.ts` (both web clients, twin files)

**Files:**
- Create: `packages/client-react/src/app/coreHost.ts`, `coreHost.test.ts`; the same two in `packages/client-solid/src/app/`
- Modify: `packages/core-api/src/app.ts` (`CoreSelection.failure$`)

**Interfaces — Produces:**

```ts
// @rtc/core-api
export interface CoreSelection {
  readonly current: CoreImpl;
  readonly options: readonly CoreOption[];
  select(impl: CoreImpl): void;
  /** Why the last `select` left the page on `current`, or null. A stream
   * because the host reports it while the same tree is still mounted. */
  readonly failure$: StateStream<string | null>;
}

// src/app/coreHost.ts
export interface Composition {
  readonly impl: CoreImpl;
  /** 1 for the boot composition, +1 per mount: the UI root's remount key. */
  readonly generation: number;
  readonly presenters: Presenters;
  readonly machineFactories: MachineFactories;
  readonly commands: AppCommands;
  readonly coreSelection: CoreSelection;
  /** True exactly once, for the composition a swap produced. */
  takePreferencesReopen(): boolean;
}

export type CoreSwapPhase = "covering" | "loading" | "handover" | "revealing";

export type CoreHostState =
  | { readonly phase: "running"; readonly impl: CoreImpl }
  | {
      readonly phase: CoreSwapPhase;
      readonly from: CoreImpl;
      readonly to: CoreImpl;
    };

export interface CoverTimings {
  readonly enterMs: number;
  readonly holdMs: number;
  readonly exitMs: number;
}

export interface CoreHostDeps {
  readonly ports: AppPorts;
  readonly initial: { readonly impl: CoreImpl; readonly core: CoreFactory };
  readonly load: (impl: CoreImpl) => Promise<CoreFactory>;
  /** Applies the devtools decorators to one composition. */
  readonly instrument: (
    core: CoreFactory,
    app: App,
  ) => Pick<Composition, "presenters" | "machineFactories">;
  readonly endComposition: () => void;
  /** Synchronous: the tree is in the DOM when it returns. */
  readonly mount: (composition: Composition) => void;
  /** Synchronous: the tree is gone when it returns. */
  readonly unmount: () => void;
  readonly publish: (impl: CoreImpl) => void;
  readonly persist: (impl: CoreImpl) => boolean;
  readonly stripCoreParam: () => void;
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly onFatal: (error: unknown) => void;
  readonly cover: CoverTimings;
  readonly sleep: (ms: number) => Promise<void>;
  readonly nextMacrotask: () => Promise<void>;
}

export interface CoreHost {
  readonly state$: StateStream<CoreHostState>;
  /** Mounts the boot composition. Called once by the entry file. */
  start(): void;
  swapTo(impl: CoreImpl): Promise<void>;
}

export function createCoreHost(deps: CoreHostDeps): CoreHost;
```

The host builds `ports = { ...deps.ports, bootSplash: playOncePerPage(deps.ports.bootSplash) }` once and passes that one object to every `createApp`. `playOncePerPage` answers the wrapped `shouldPlay()` on its first call and `false` after.

**Cases** (`coreHost.test.ts`, fake cores built by a `createFakeCore(impl, log)` factory that records `createApp` / `dispose` into a shared log; `sleep` and `nextMacrotask` resolved by the test):

1. `start()` composes the initial core once over the given ports, mounts generation 1, publishes its impl.
2. `swapTo` runs the steps in order — the shared log reads `cover, load, unmount, macrotask, dispose:rxjs, endComposition, createApp:effect, mount:2, publish:effect, persist:effect, stripCoreParam, lift`.
3. both compositions receive the **same** ports object (`toBe`).
4. `swapTo(current)` does nothing; a second `swapTo` during a swap does nothing (one `createApp`).
5. load rejects → state returns to `running` on the old impl, no unmount, no persist, `failure$` carries the message; the next `swapTo` clears `failure$`.
6. new `createApp` throws → the previous core is composed again and mounted, `failure$` carries the message, the saved choice is untouched, `publish` names the previous impl.
7. both compositions throw → `onFatal` is called once with the second error; nothing is mounted.
8. `old.dispose()` rejects → a warning is logged and the swap completes.
9. `persist` returns false → a warning says the choice will not survive a reload; the swap stands.
10. `shouldPlay()` is `true` for the first composition and `false` for the second when the environment says play.
11. `takePreferencesReopen()` is `false` on the boot composition, `true` then `false` on a swapped one, and `true` on the recomposed previous core of case 6.
12. `state$` walks `running → covering → loading → handover → revealing → running`, and the hold is measured from the end of `covering`: with `holdMs = 500` and a load that takes 800 ms the host does not wait again; with a 0 ms load it waits the remaining 500.
13. the console line is `[core] swapped rxjs to effect`.

- [ ] Step 1: add `failure$` to `CoreSelection`; `pnpm typecheck` shows every producer and fake that must supply it (both `coreSelection.ts`, `ui-contract`'s `world.ts`, both `buildFakeViewModel.ts`, both page objects). Give each a `BehaviorSubject<string | null>(null)`.
- [ ] Step 2: write the 13 cases in `client-react` — RED. Implement `createCoreHost` — GREEN. Copy both files to `client-solid`; run there.
- [ ] Step 3: mutants, one per case (swap two adjacent steps for case 2; build fresh ports per composition for 3; remove the in-flight guard for 4; unmount before load for 5; skip the recomposition for 6; and so on).
- [ ] Step 4: commit `feat(web): core host — owns the ports and swaps the composition`.

### Task 8: wire the host into both clients

**Files (each client):**
- Modify: `src/main.tsx`, `src/AppRoot.tsx`, `src/app/coreSelection.ts` (+ test), `src/app/bootApp.ts` only if `runBoot`'s callback type changes
- Modify: `packages/react-bindings/src/createViewModel.ts`, `packages/solid-bindings/src/createViewModel.ts` (`ViewModelShell.takePreferencesReopen?: () => boolean`; the ViewModel exposes `takePreferencesReopen(): boolean`, default `false`)
- Modify: `src/ui/shell/chrome/HeaderChrome.tsx`, `src/ui/shell/prefs/PreferencesContent.tsx`
- Modify: `packages/ui-contract` (world + the Preferences contract spec), both page objects

**What changes:**

- `createCoreSelection` shrinks to `{ current, swapTo, failure$ }` → `CoreSelection`; the save-and-navigate branch and its tests go. `urlWithoutCoreParam`, `saveCoreChoice` and `defaultCoreResetHref` stay (the entry file and the boot-error screen use them).
- `AppRoot` takes `composition: Composition` and only builds the ViewModel: `createViewModel(composition.presenters, composition.machineFactories, composition.commands, { coreSelection: composition.coreSelection, demoAccounts: readDemoAccounts(), takePreferencesReopen: composition.takePreferencesReopen })`. React keeps the lazy ref (StrictMode); the comment about `createApp` running once moves to the host.
- `main.tsx`, inside `runBoot`'s `onBooted`: build the ports once, create the host, `host.start()`.
  - React: one `createRoot(rootEl)`; `mount` is `flushSync(() => root.render(<StrictMode><AppRoot key={composition.generation} composition={composition}><App /></AppRoot></StrictMode>))`; `unmount` is `flushSync(() => root.render(null))`.
  - Solid: `mount` stores the disposer `render(...)` returns; `unmount` calls it.
  - `instrument` wraps `instrumentPresenters` / `instrumentMachineFactories` with `PRESENTER_MANIFEST` and `devtoolsHub`; `endComposition` is `devtoolsHub.endComposition`.
  - `cover` is all zeros in this PR.
- `HeaderChrome` opens the modal once on mount when `takePreferencesReopen()` returns true (React: in an effect, so StrictMode's double invocation consumes it once; Solid: `onMount`).
- `PreferencesContent`: the row renders `failure$` as an inline error line (`data-testid="prefs-core-failure"`) and its description says the core is swapped in place.

**Tests:**
- `coreSelection.test.ts`: `select` calls `swapTo`; re-selecting the current core does not; `failure$` is the host's stream.
- UI contract (shared, both clients): the failure line appears when `failure$` emits and clears when it emits null; the modal opens once when the world's `takePreferencesReopen` yields true, and does not reopen after `AuthGate` remounts the chrome (sign out, sign in).
- Each new test gets a mutant.

- [ ] Steps: RED tests first per bullet, then the wiring, then `pnpm typecheck && pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-solid test`, both `test:ui:contract:coverage` gates, `pnpm check:core-bundle`. Commit `feat(web): the Preferences core row swaps in place`.

### Task 9: cross-core and leak witnesses

**Files:** Create `packages/client-react/src/app/coreHost.swap.test.ts` and the Solid twin.

Real `buildBrowserPorts()` (`vi.stubEnv("VITE_DEV_AUTH", …)`), the three real cores, a real `createCoreHost` with no-op `mount` / `unmount`, fake timers.

1. **Six ordered pairs** (`it.each`): sign in and execute a trade on A; `await host.swapTo(B)`; B is authenticated with no login, connected, ticking, and its blotter holds the trade id. (The promoted probe; its source is in `scratchpad/hotswap/hotSwapProbe.test.ts`.)
2. **Matches fresh ports while the browser is offline:** dispatch `offline` on `window`, swap, and compare B's `connection.status$` with a fresh `buildBrowserPorts()` + `createApp` under the same condition. Equal.
3. **Matches fresh ports after a reconnect intent in flight:** `commands.reconnect()` on A, swap before advancing the clock, same comparison.
4. **Leak witness:** wrap every port method that returns an Observable with a subscribe/finalize counter (a local `createTalliedPorts(ports)` factory, declared below the cases). Warm a fixed stream set, release, record the baseline after the first composition; run five swaps around the three cores, warming and releasing each time; the live count after each release equals the baseline.

- [ ] Steps: write, run, mutants (compose over fresh ports → case 1; skip `old.dispose()` in the host → case 4). A red case 2 or 3 is a port that cannot be re-joined: fix the adapter to replay its current state, in this PR. Commit `test(web): hot swap across every core pair, and no leaked port subscription`.

### Task 10: live smoke

**Files:** Modify `tests/fullstack/node-smoke.ts` (a `runHotSwapSmoke()` section), `tests/package.json` (devDependencies on `@rtc/client-core-async`, `@rtc/client-core-effect`; a real importer change, so `pnpm-lock.yaml` is committed).

One `WsAdapter` (`autoConnect: false`) + `createWsRealPorts` + `pairConnectionPorts`; compose RxJS, trade, dispose, compose async, then Effect; each sees the trade; a counting `WebSocket` subclass asserts exactly one socket opened. Source: `scratchpad/hotswap/hotswap-live-probe.ts`.

- [ ] Steps: write; `pnpm --filter @rtc/tests test:fullstack:node`; mutant: `ws.disconnect()` between compositions → the socket count assertion fails. Commit.

### Task 11: browser e2e

**Files:** Modify `tests/browser/playwright/coreSwitch.spec.ts`, `tests/browser/scenarios/coreSwitch.ts`, the `Preferences` / `Workspace` page-object contracts and their Playwright implementations.

Journey (replaces the "save + navigate" middle of the existing test; the `?core=` precedence steps stay):

1. open with `?core=<start>`, sign in, execute a trade, set `window.__hotSwapMark = 1`, change the layout (collapse a panel).
2. Preferences → select `buildDefault`: `data-core-impl` becomes `buildDefault`; the mark is still 1 (no navigation); the URL has no `?core=`; no login screen; the Preferences modal is open and its row reads `buildDefault`; the trade is in the blotter; the panel is still collapsed; a tile's price changes within 5 s.
3. select `stored`: the same assertions.
4. reload: boots on `stored`. Since `stored` differs from the build default (`pickDistinctCores`), that can only come from the saved choice.
5. (Review Focus 2) float a panel before step 2 when the page object has a float verb; after the swap the float is present. Otherwise check by hand and record it in the PR.

- [ ] Steps: write; `pnpm test:e2e` unfiltered and unpiped for both clients; run once per `RTC_CORE_IMPL` leg locally if time allows, CI runs all three. Commit.

### Task 12: docs, gate, review, ship PR 4

- ADR-006: **Decision 7 — hot swap in place** (ports outlive a core; the host; the step order; the failure table), Follow-up 7 struck.
- §22: guarantee 7, "a core can be composed over ports another composition used" (the `recomposition` suite), and the flushed layout write under the dispose guarantee. §23: the matching promise 10.
- `CLAUDE.md`: status paragraph and the application-core rule. `docs/STATUS.md`: the entry now says only the overlay remains.
- [ ] `/rtc:gauntlet full`, mutation spec, reviewer, ship as Task 4.

---

## PR 5 — the overlay (worktree `hot-swap-overlay`)

### Task 13: `CoreSwapOverlay` in both clients

**Files (each client):**
- Create: `src/ui/shell/core/CoreSwapOverlay.tsx`, `CoreSwapOverlay.module.css`
- Modify: `src/main.tsx` (a second root on a `<div id="core-swap-overlay">` appended to `body`, rendering the overlay from `host.state$`; `cover` becomes `{ enterMs: 160, holdMs: 500, exitMs: 200 }`, or all zeros when `navigator.webdriver` is true)

**Interfaces — Produces:**

```ts
export interface CoreSwapOverlayProps {
  /** null while no swap is under way: the overlay renders nothing. */
  readonly swap: {
    readonly from: CoreOption;
    readonly to: CoreOption;
    readonly phase: CoreSwapPhase;
  } | null;
}
```

Markup: a fixed full-viewport element, opaque background from the skin's page token, `role="status"`, `data-testid="core-swap-overlay"`, `data-phase`; a "CORE SWAP" label, the two labels with a separator glyph, a status line (`covering` / `loading` → "loading", `handover` → "handing over", `revealing` → "online"), and a visually hidden sentence "Swapping application core from RxJS to Effect". Opacity is 1 in every phase except the leaving frame; the only transition is `opacity`. `[data-power-saver="freeze"]` and `prefers-reduced-motion` already remove transitions globally; verify the overlay inherits that and add nothing.

**Tests:**
- Behaviour, same case names in both clients: renders nothing for `null`; names both cores; the status line per phase; `role="status"`; the hidden sentence. Placement: a shared `@rtc/ui-contract` spec if the harness can mount a component that takes no ViewModel; otherwise twin co-located tests, recorded as a ruling.
- Visual: one scenario, `shell/core-swap-overlay` in the `handover` phase (a static frame), added by the recipe in the visual-scenario memory note; goldens regenerated with the `update-visual-goldens` workflow (`scenario_pattern` scoped to the new scenario).
- `pnpm perf:motion-audit` for both clients: freeze stays motion-free.
- A trace of one swap shows zero `compositeFailed` events.
- e2e: the journey of Task 11 still passes (durations are zero under webdriver); one added assertion that the overlay element is absent after the swap.

- [ ] Steps: read `docs/performance.md`; RED tests; component and stylesheet; wire `main.tsx`; run the tiers above; browser check in both clients across the skins, with and without power-saver freeze. Commit `feat(web): the core-swap overlay`.

### Task 14: docs, gate, review, ship PR 5

- `docs/STATUS.md`: the hot swap entry removed. `CHANGELOG.md` is written by `/rtc:changelog`, not here. ADR-006 Decision 7 gains the overlay paragraph. Memory: the workstream note updated.
- [ ] `/rtc:gauntlet full`, reviewer, ship as Task 4. No deploy without the user's explicit go.
