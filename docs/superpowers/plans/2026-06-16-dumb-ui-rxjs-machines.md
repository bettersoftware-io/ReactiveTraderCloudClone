# Restore Dumb-UI across the client: relocate logic out of React components — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the React UI dumb — relocate all business logic, orchestration, transport, persistence, and timers out of components into the RxJS application layer (machines/presenters/ports), exposed through the single `AppHooks` seam; the only new UI primitive is a logic-free `useMachine` bridge.

**Architecture:** App-layer RxJS machine factories + presenters (no React, marble-tested under `TestScheduler`) behind the single `AppHooks` seam (Option 1). Timers become RxJS. Per-instance ephemeral state uses react-rxjs `state()` + a `useMachine` bridge; global/shared state keeps react-rxjs `bind`. Two new ports (`AdminPort` for throughput over WS, `PreferencesPort` for theme+viewMode). Pure refactor — observable behaviour unchanged, guarded by the presenter + e2e + full-stack behavioural suites.

**Tech Stack:** React 19, `@react-rxjs/core` (`state`/`bind`/`useStateObservable`), RxJS (+ `TestScheduler` marble tests), Vitest, the visual three-runner harness.

**Reference spec:** `docs/superpowers/specs/2026-06-16-dumb-ui-rxjs-machines-design.md`

**Branch:** `feat/dumb-ui-rxjs-machines` (checked out; spec committed).

---

## Critical cross-cutting guidance (read before any phase)

- **Pure refactor, no behaviour change.** The presenter + e2e + full-stack smokes are the faithfulness guardrail — run them at phase boundaries. A new marble/contract test asserts the *relocated* behaviour; the existing behavioural suites prove it didn't change.
- **react-rxjs decision (verified `@react-rxjs/core@0.10.8`):** per-instance machines expose `state$` via `state(observable, default)` (a `DefaultedStateObservable` with synchronous `.getValue()`), read by the bridge via `useStateObservable`. Global/shared presenters keep `bind`. No hand-rolled `useSyncExternalStore` needed.
- **The `useMachine` bridge is the ONLY new UI primitive** and the ONLY `src/ui` file outside `src/ui/hooks/` permitted to touch `rxjs`/react-rxjs. Components never import it — they call `useHooks()`; `createAppHooks` wires the bridge.
- **Provider-nesting flip (HIGHEST breakage risk):** after Phase 7, `ThemeProvider` calls `useHooks()`, so **`HooksProvider` must be the OUTER provider** in the app root (`App.tsx`/`main.tsx`) and in every test harness (contract `render.tsx`, the visual harness). Flip `<ThemeProvider><HooksProvider>` → `<HooksProvider><ThemeProvider>` in the same commit as the thinned `ThemeProvider`.
- **`createAppHooks` signature grows a `machines: MachineFactories` param** (Phase 1) and gains members each phase. Find every call site: `grep -rn "createAppHooks(" packages/client`. The visual/contract tiers build `AppHooks` via fakes (`buildFakeHooks` / `hooksFromWorld`), not `createAppHooks`, so they're unaffected by the signature but MUST gain each new seam member (typed against the real `AppHooks`, which is the drift guard).
- **Type re-homing:** `TileState`→`TileExecutionState`, `RfqState`/`RfqQuote`/`RfqStatus`, `UseNotionalResult`→`NotionalView` live in the deleted hook files but are imported by leaf components AND `tests/ui/contract/react/registry.tsx`. Re-export from the new machine files and update importers in the same phase that deletes the hook (`grep -rn` before deleting).
- **Dependency order:** Phase 0 (bridge) → 1–4 (tile/stale machines) → 5 (throughput, independent) → 6 (seam→Promise) → 7 (PreferencesPort; provider flip) → 8 (residual orchestration; depends on 6 + 0) → 9 (visual; depends on 0–4) → 10 (gates+verify; depends on all).
- **Per-task commit**, trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Goldens (Phase 9):** only `react-local/linux-arm64` generatable here (Playwright, not Cypress); the CI `react/` set is the `update-visual-goldens` workflow's job — visual CI stays red until it runs (expected).
- **No `turbo.json`/`@rtc/shared` changes; no new CI gates beyond the Phase 10 grep-gates.** Server change is limited to removing the HTTP `/throughput` route (Phase 5).

---

## Phase 0 — `useMachine` bridge

**Files:** Create `packages/client/src/ui/hooks/machine.ts`, `useMachine.ts`, `useMachine.test.tsx`.

**Decision:** use react-rxjs `state()` + `useStateObservable` (confirmed in `@react-rxjs/core@0.10.8`'s `.d.ts`).

- [ ] **Define the machine contract.** `machine.ts`:
```ts
import type { StateObservable } from "@react-rxjs/core";

/** Every app-layer machine factory returns this: a react-rxjs StateObservable
 * carrying current state, plain intent methods, and dispose() that completes
 * the machine's Subjects / tears down subscriptions. Bridge-only consumer. */
export interface Machine<TState, TIntents extends object> {
  state$: StateObservable<TState>;
  intents: TIntents;
  dispose: () => void;
}
```

- [ ] **Write the bridge test first (TDD).** `useMachine.test.tsx` (`@testing-library/react` `renderHook`): (1) factory called once across re-renders; (2) `state` reflects `state$` + re-renders on emission; (3) intents pass through with stable refs; (4) `dispose()` once on unmount, not on re-render. (Full test body per the authored Phase 0 — uses a `BehaviorSubject` + `state(...)` test machine.) Run `pnpm --filter @rtc/client vitest run src/ui/hooks/useMachine.test.tsx` → fails (no module).

- [ ] **Implement the bridge.** `useMachine.ts`:
```ts
import { useEffect, useRef } from "react";
import { useStateObservable } from "@react-rxjs/core";
import type { Machine } from "./machine";

/** Logic-free bridge: instantiates the factory once per mount (lazy useRef so
 * StrictMode double-render can't double-instantiate), reads state$ via
 * useStateObservable, returns { state, ...intents } (stable intent refs), and
 * disposes on unmount. The only UI primitive allowed to import react-rxjs;
 * components never import it (createAppHooks does). */
export function useMachine<TState, TIntents extends object>(
  factory: () => Machine<TState, TIntents>,
): { state: TState } & TIntents {
  const ref = useRef<Machine<TState, TIntents> | null>(null);
  if (ref.current === null) ref.current = factory();
  const machine = ref.current;
  useEffect(() => () => machine.dispose(), [machine]);
  const state = useStateObservable(machine.state$);
  return { state, ...machine.intents };
}
```
Re-run the test → green.

- [ ] **Typecheck + commit.** `pnpm --filter @rtc/client typecheck`; commit `feat(client): add logic-free useMachine bridge for app-layer machines`.

---

## Phase 1 — `createTileExecutionMachine` (absorbs `useTileState` + `useExecuteTrade`)

**Files:** Create `packages/client/src/app/presenters/TileExecutionMachine.ts` + `__tests__/TileExecutionMachine.test.ts`; modify `createAppHooks.ts`, `composition.ts`, both fake seams, `Tile.tsx`, `TileConfirmation.tsx`, contract `registry.tsx`; delete `useTileState.{ts,test.tsx}` + `useExecuteTrade.{ts,test.tsx}`.

**Behaviour to preserve (verified):** `execute()`→`started`; calls injected execute command; resolve→`finished{status,trade}`; reject→`finished{ExecutionStatus.Timeout}` (the *finished* state, not `timeout`). While `started`: `TOO_LONG_THRESHOLD_MS`(2000)→`tooLong` (if still started); `EXECUTION_TIMEOUT_MS`(30000)→`timeout` (from started|tooLong) then nested `CONFIRMATION_DISMISS_MS`(5000)→`ready`. On `finished`: `CONFIRMATION_DISMISS_MS`→`ready`. `dismiss()`→`ready` immediately. A command result landing AFTER the 30s timeout is dropped (state stays `timeout`). All three constants already in `@rtc/domain` (`fx/trade.ts`) — no domain change.

- [ ] **Marble tests first (TDD).** `TileExecutionMachine.test.ts` with `TestScheduler` (introduces the marble pattern). Inject a fake `execute: (input) => Observable<ExecuteTradeResult>` so the result's timing is marble-controlled. Cover every transition listed above + `dispose()` completes `state$`. (Full skeleton per authored Phase 1.) Run → fails.

- [ ] **Implement the machine.** `TileExecutionMachine.ts` exporting `TileExecutionState` (`ready|started|tooLong|finished{executionStatus,trade?}|timeout`), `TileExecutionDeps {execute}`, `TileExecutionIntents {execute,dismiss}`, and `createTileExecutionMachine(pair, deps): Machine<...>`. Structure: `execute$`/`dismiss$` Subjects; `switchMap` per execute run racing `result$` (with `catchError`→finished{Timeout}) vs `timer(EXECUTION_TIMEOUT_MS)`→timeout, plus `timer(TOO_LONG_THRESHOLD_MS)`→tooLong, collapsed via `scan` so once terminal later non-terminals are ignored, then `switchMap` to append `timer(CONFIRMATION_DISMISS_MS)`→ready; `merge` with `dismiss$`→ready; wrap in `state(..., READY)`; keep-warm `state$.subscribe()` torn down in `dispose()`. **The marble tests are the contract — iterate operator arrangement until every case (esp. "late result dropped after timeout", "tooLong suppressed once terminal") matches.** (Full impl per authored Phase 1.) Run → green.

- [ ] **Seam + factory wiring.** Add `useTileExecution(pair)` to `AppHooks`; add `machines: MachineFactories` param to `createAppHooks` with `tileExecution` and implement `useTileExecution = (pair) => useMachine(() => machines.tileExecution(pair))`; in `composition.ts` build `machines.tileExecution = (pair) => createTileExecutionMachine(pair, { execute: (i) => presenters.execution.execute(i) })` and thread to `createAppHooks` at every call site.

- [ ] **Fakes.** Visual `buildFakeHooks`: `useTileExecution: () => ({ state: data.tileExecution ?? {status:"ready"}, execute: noop, dismiss: noop })` + add `tileExecution?` to `AppData`. Contract `hooksFromWorld.ts`: reactive `useTileExecution` backed by a World subject + command recorders; extend `World`.

- [ ] **Thin `Tile.tsx` + re-home `TileConfirmation`'s type.** Replace `useTileState`/`useExecuteTrade` with `const tileExecution = hooks.useTileExecution(pair)`; `isBusy = tileExecution.state.status !== "ready"`; `handleExecute` → `tileExecution.execute(...)` (no async/firstValueFrom); `<TileConfirmation state={tileExecution.state} onDismiss={tileExecution.dismiss}/>`. Re-point `TileConfirmation.tsx` + contract `registry.tsx` `TileState` import → `TileExecutionState` from the machine.

- [ ] **Run guardrails:** `test:app`, `test:ui:contract`, `typecheck`, + the execution behavioural/e2e suite → green.

- [ ] **Delete old hooks + tests** (`git rm` the 4 files); re-run typecheck + the two client suites.

- [ ] **Commit** `refactor(client): relocate tile execution logic to createTileExecutionMachine`.

---

## Phase 2 — `createRfqTileMachine` (absorbs `useRfqState` + `useRfqQuote`)

Same shape as Phase 1. **Files:** create `RfqTileMachine.ts` + marble test; modify seam/composition/fakes/`Tile.tsx`/`TileRfq.tsx`/contract registry; **move `RFQ_TIMEOUT_MS`(10000)+`REJECTED_DISPLAY_MS`(2000) into `@rtc/domain`** (export from index; names match the existing UI-local literals); keep `COUNTDOWN_INTERVAL_MS=100` as a presenter constant; delete `useRfqState.{ts,test.tsx}` + `useRfqQuote.{ts,test.tsx}`.

**Behaviour to preserve (verified):** `requestQuote()` no-op unless `init`→`requested`; calls request-quote command `(symbol, pipsPosition)`; resolve→`received{quote{bid,ask,timeoutMs:RFQ_TIMEOUT_MS}, remainingMs}`; reject→`rejected`. `received`: countdown every 100ms decreasing `remainingMs`; `<=0`→`rejected`. `rejected`: hold `REJECTED_DISPLAY_MS`→`init`. `cancel()` guarded to `requested`→`init`; `reject()` guarded to `received`; `accept()` guarded to `received` → `init`. **`accept()` no longer returns the quote synchronously** — `TileRfq` must capture `state.quote` BEFORE calling `accept()`, build the synthetic `Price`, then `onExecute(...)`. Countdown via `timer(0, COUNTDOWN_INTERVAL_MS)` mapped to remaining (deterministic under `TestScheduler`), not `Date.now()`.

- [ ] Move the two constants to `@rtc/domain` (+ export); `pnpm --filter @rtc/domain test`/`build`.
- [ ] Marble tests first (all transitions + countdown + guards + dispose) → implement `RfqTileMachine.ts` (re-export `RfqStatus`/`RfqState`/`RfqQuote`) → green.
- [ ] Seam `useRfqTile(pair)` + `MachineFactories.rfqTile` wired to `presenters.rfqQuote.requestQuote`; fakes (visual `rfqTile?` + contract World subject).
- [ ] Thin `Tile.tsx` (`useRfqTile`) + `TileRfq.tsx` (capture-quote-before-accept; new intent calls; type import → machine); update contract registry type import.
- [ ] Guardrails (`test:app`, `test:ui:contract` esp. `TileRfq.contract.spec`, typecheck, RFQ e2e) → delete old hooks → commit `refactor(client): relocate RFQ tile logic to createRfqTileMachine`.

---

## Phase 3 — `createStaleFlagMachine` (replaces `useStaleDetection`)

**Files:** create `StaleFlagMachine.ts` + marble test; modify seam/composition/fakes/`Tile.tsx`/`AnalyticsPanel.tsx`; delete `useStaleDetection.{ts,test.tsx}`.

**Behaviour to preserve (verified):** "disconnected → reconnected → no-new-value ⇒ stale; clears when a new value reference arrives after reconnect." A `scan` over a merged tagged stream of `connection.status$` + the value stream, latching `wasDisconnected`, recording `valueAtReconnect`, clearing on reference change. Read-only flag (no intents).

- [ ] Generic `createStaleFlagMachine(deps:{status$, value$})`; **two consumers** → two seam hooks: `useStaleFlag(pair)` (value$=`priceStream.price$(pair)`) and `useAnalyticsStaleFlag()` (value$=`analytics.position$`). Confirm `analytics.position$` exists.
- [ ] Marble tests first (connected/never-stale; disconnect→reconnect→stale; new-value clears; same-ref stays stale; multi-cycle; dispose) → implement (`map`→`distinctUntilChanged`→`state(...,false)`; `useStaleFlag = (pair) => useMachine(()=>machines.staleFlag(pair)).state`) → green.
- [ ] Seam + `MachineFactories.{staleFlag, analyticsStaleFlag}`; fakes (`stale?`/`analyticsStale?`).
- [ ] Thin `Tile.tsx` (`const stale = hooks.useStaleFlag(pair)` — drop the `price` arg) + `AnalyticsPanel.tsx` (`useAnalyticsStaleFlag()`).
- [ ] Guardrails → delete hook → commit `refactor(client): relocate stale detection to createStaleFlagMachine`.

---

## Phase 4 — `createNotionalMachine` (replaces `useNotional`)

**Files:** create `NotionalMachine.ts` + test; modify seam/composition/fakes/`Tile.tsx`/`TileNotional.tsx`/contract registry; delete `useNotional.{ts,test.tsx}`. After this, `tile/hooks/` is empty — `rmdir` it.

**Behaviour to preserve (verified):** initial from `defaultNotional` (formatted display, isRfq, isDefault:true). `change(input)`: `parseNotional`; failure→`{displayValue: rawInput, numericValue:0, error, isRfq:false, isDefault:false}` (raw preserved); success→`{formatted, value, error(may be non-null warning), isRfq, isDefault: value===default}`. `reset()`→initial. Seam renames `onChange`→`change`; update `TileNotional` call. No timers. Uses `@rtc/domain` `parseNotional`/`isRfqRequired` (already exported); `formatWithCommas` is a private presenter helper.

- [ ] Unit/marble tests first (mirror the deleted `useNotional.test.tsx` cases exactly — cross-check before deleting) → implement `createNotionalMachine(defaultNotional)` (reducer via `scan`; `state(...)`) → green. (Full impl per authored Phase 4.)
- [ ] Seam `useNotional(defaultNotional)` + `MachineFactories.notional`; fakes (`notional?`).
- [ ] Thin `Tile.tsx` (`hooks.useNotional(pair.defaultNotional)`) + `TileNotional.tsx` (`onChange`→`change`, type→`NotionalView`); update contract registry.
- [ ] Guardrails → delete hook + `rmdir tile/hooks` → commit `refactor(client): relocate notional logic to createNotionalMachine`.

---

## Phase 5 — Throughput over WS (the 9th port)

Replace the HTTP `useThroughput` hook with the full ports/presenters/WS stack. `useThroughput` reaches components via react-rxjs `bind` (a global singleton presenter), NOT `useMachine`. **Constant home:** `DEBOUNCE_MS`(300)+`MESSAGE_DISMISS_MS`(3000) are presenter constants (UI cadence). **Wire facts (verified):** `GET_THROUGHPUT`→ack `{type:"ack",payload:<number>}`; `SET_THROUGHPUT` payload `{value}`→`{type:"ack"}`/`{type:"nack"}` (RPCs unchanged).

- [ ] **5.1 Domain `AdminPort`.** Create `packages/domain/src/ports/adminPort.ts` (`getThroughput(): Observable<number>`, `setThroughput(value): Observable<void>`); export from domain index.
- [ ] **5.2 Port-contract describer** `ports/__contracts__/AdminPortContract.ts` with harness `{ port; driver: { primeGet(value); flushGet(); ackSet() }; teardown }`. Get test sequence: `driver.primeGet(250); const p = firstValueFrom(port.getThroughput()); await driver.flushGet(); expect(await p).toBe(250)`. Set test: `firstValueFrom(port.setThroughput(500))` → `await driver.ackSet()` → `resolves.toBeUndefined()`. (This dual-method driver works for both the synchronous simulator and the pending-RPC WsReal adapter.)
- [ ] **5.3 `ThroughputSimulator`** (`domain/src/simulators/`): in-memory, default 100, range 0–1000, finite guard (mirrors server `ThroughputService`); export from simulators index + domain index.
- [ ] **5.4 Sim unit test + sim contract test** (`primeGet` seeds the value, `flushGet`/`ackSet` are `await Promise.resolve()` no-ops). Run `pnpm --filter @rtc/domain test` → green; commit `feat(domain): add AdminPort + ThroughputSimulator + port-contract (9th port)`.
- [ ] **5.5 WsReal admin adapter in `portFactory.ts`.** Add `admin: AdminPort` to `AppPorts`; add admin protocol consts to the mirrored `CLIENT_MSG`/`SERVER_MSG`; `createAdminPort(ws)` using `ws.rpc(CLIENT_MSG.GET_THROUGHPUT)` (read `resp.payload` as number; nack→error `/Failed to get throughput/`) and `ws.rpc(CLIENT_MSG.SET_THROUGHPUT,{value})` (nack→error `/Failed to set throughput/`), both as cancellable `Observable`s (mirror `createExecutionPort`); wire `admin` into `createSimulatorPorts` (`new ThroughputSimulator()`) + `createWsRealPorts` (`createAdminPort(ws)`).
- [ ] **5.6 WsReal contract + nack tests** (`wsRealAdmin.contract.test.ts` using `FakeWsAdapter`+`awaitPendingRpc`+`rpcAck`; `wsRealAdmin.errors.test.ts` for the two nacks). Run `test:app` → green; commit `feat(client): wire AdminPort through portFactory (WsReal + simulator)`.
- [ ] **5.7 `ThroughputPresenter`** (`app/presenters/`): `state$` (`value`/`loading`/`message`) + `setValue(value)` intent; initial load via `admin.getThroughput()` (startWith loading, catchError→default); optimistic value on intent; debounced write `debounceTime(DEBOUNCE_MS)`→`switchMap(setThroughput → message)` with `timer(MESSAGE_DISMISS_MS)`→null dismiss; fold partials via `scan` into the full view state; wrap in react-rxjs `state(..., INITIAL)`. Marble test (`TestScheduler`): initial seed, optimistic, debounce coalescing, success+dismiss@3000ms, error, initial-load failure. Run `test:app` → green; commit `feat(client): add ThroughputPresenter (RxJS debounce + dismiss)`.
- [ ] **5.8 Composition + seam.** Add `throughput: ThroughputPresenter` to `Presenters` (construct `new ThroughputPresenter(ports.admin)`); add `useThroughput()` to `AppHooks` via `bind(presenters.throughput.state$, INITIAL)` + pre-bound `setValue`.
- [ ] **5.9 Thin `AdminPanel.tsx`** (read `useHooks().useThroughput()`; no `fetch`/env/timers/rxjs) + fakes (visual `throughput?`; contract World subject + `setThroughput` recorder) + rewrite `AdminPanel.contract.spec.ts` to drive via World (no `page.route`/fetch stub) + update `AdminPanelPage` doc-comment/`waitUntilLoaded`; delete `useThroughput.{ts,test.tsx}`. Run `test:app`+`test:ui:contract` → green; commit `refactor(client): thin AdminPanel over useThroughput seam; delete useThroughput hook`.
- [ ] **5.10 Remove server HTTP `/throughput` + client env.** Remove the GET/PUT `/throughput` branches + the now-orphan `OPTIONS`/`PUT` CORS bits from `packages/server/src/index.ts` (keep `/health`; **keep `ThroughputService`** — still used by `wsHandler`/`serviceContainer`). Verify no dependents: `grep -rn "/throughput" packages tests` (only spec docs) + `grep -rn "VITE_SERVER_HTTP_URL" .` (only spec). Add a throughput round-trip assertion to `tests/fullstack/node-smoke.ts` (get→set 250→get===250 over `ports.admin`). Run `@rtc/server test`, both builds, `test:fullstack:node` + `:browser` → PASS; commit `refactor: remove server HTTP /throughput route + client VITE_SERVER_HTTP_URL (WS is sole transport)`.

**Phase 5 exit:** domain/client/server suites + full-stack smokes green; `grep -rn "fetch\|import.meta.env" packages/client/src/ui` → no throughput hits.

---

## Phase 6 — Seam commands → `Promise`

Flip the seven `AppHooks` command callbacks from `=> Observable<T>` to `=> Promise<T>` (bridge does `firstValueFrom`); the three credit components then `await` and drop `rxjs`.

- [ ] **6.1 Flip the seam** in `createAppHooks.ts`: add `firstValueFrom` to the `rxjs` import (bridge layer — allowed); change the interface signatures for `useExecuteTrade`/`useCreateRfq`/`useAcceptQuote`/`useCancelRfq`/`usePassQuote`/`useQuoteRfq`/`useRequestRfqQuote` to `=> Promise<T>`; wrap each pre-bound command in `firstValueFrom(presenters...)`. (Void commands `next(undefined)` before completing, so `firstValueFrom` resolves `undefined` — no `defaultValue` needed; verified.)
- [ ] **6.2 Drop `firstValueFrom`/`rxjs` from the three components:** `RfqTilesPanel.tsx` (`await acceptQuote(id)`), `NewRfqForm.tsx` (`await createRfq(...)` — leave its `setTimeout` for Phase 8), `TradeTicket.tsx` (`await quoteRfq(...)`/`await passQuote(...)`). Do NOT touch the tile hooks (Phases 1–2 own them).
- [ ] **6.3 Update fakes to Promise shape:** visual `buildFakeHooks` commands → `async` no-ops returning type-correct values (drop `EMPTY`/`Observable` imports); contract `hooksFromWorld.ts` commands → `async` recording inputs + returning canned `world.results` (error paths `throw` so `await` rejects). Read the three contract specs first to preserve each canned result/error.
- [ ] **6.4 Verify:** `grep -rn "firstValueFrom\|from \"rxjs\"" packages/client/src/ui/credit` → zero; `grep -rn "from \"rxjs\"" packages/client/src/ui` → only `src/ui/hooks/`. Run `test:app`+`test:ui:contract`+`typecheck`+full-stack smokes → green; commit `refactor(client): seam commands return Promise; drop rxjs from credit components`.

---

## Phase 7 — `PreferencesPort` (no `localStorage` in `src/ui`)

**Decision (port shape):** explicit typed methods — `theme$()/setTheme()`, `viewMode$()/setViewMode()` returning replay-current Observables (BehaviorSubject-backed adapters). Justified by closed-union type safety, the synchronous-initial-value requirement (prevents the theme-flash the contract spec pins), and two independent consumers → two small presenters. `Theme`/`ViewMode`/`DEFAULT_*` move to `@rtc/domain`. This is the **10th port**.

- [ ] **7.1 Domain** `preferences/preferences.ts` (`Theme`/`ViewMode`/`DEFAULT_THEME="dark"`/`DEFAULT_VIEW_MODE="chart"`) + `ports/preferencesPort.ts`; export from domain index.
- [ ] **7.2 Port-contract describer** `__contracts__/PreferencesPortContract.ts`: defaults with empty store; synchronous replay on subscribe; `setTheme`/`setViewMode` persist + push to existing subscribers; seeded store reads back; invalid stored value → default. Takes `makeEmpty()` + `makeSeeded(seed)` harnesses.
- [ ] **7.3 `PreferencesSimulator`** (`domain/src/simulators/`, BehaviorSubject-backed + seed + `distinctUntilChanged`) + contract test. Run `@rtc/domain test` → green; commit `feat(domain): add PreferencesPort + in-memory simulator + port contract`.
- [ ] **7.4 `LocalStoragePreferencesAdapter`** (`client/src/app/adapters/`, keys `rtc-theme`/`rtc-view-mode`, try/catch read+write, BehaviorSubject-backed) + `preferences.contract.test.ts` (runs the domain describer against it via jsdom `localStorage`). This is the ONLY client `localStorage` site. Run `test:app` → green; commit `feat(client): add localStorage PreferencesPort adapter + contract`.
- [ ] **7.5 Wire `preferences` into `AppPorts` + both factories** (both use `LocalStoragePreferencesAdapter` — real browser persistence in sim mode too; `PreferencesSimulator` is for domain tests + fakes). Commit `feat(client): wire PreferencesPort into portFactory`.
- [ ] **7.6 `ThemePreferencePresenter` + `ViewModePreferencePresenter`** (`shareReplay({bufferSize:1,refCount:true})`; theme presenter has `toggle(current)`) + tests over `PreferencesSimulator`. Commit `feat(client): add Theme/ViewMode preference presenters + tests`.
- [ ] **7.7 Composition** constructs both presenters. **7.8 Seam** `useThemePreference()` (`{theme,setTheme,toggle}`) + `useViewModePreference()` via `bind` + the `toggle` closure reading the bound value in the hook body.
- [ ] **7.9 Thin `ThemeProvider.tsx`** (toggle UI + `useLayoutEffect(applyTokens)` stay; `useState`/`readStoredTheme`/`localStorage` removed; reads `useHooks().useThemePreference()`). **`ThemeToggle.tsx` unchanged.** **FLIP provider nesting** so `HooksProvider` is outer (app root + harnesses).
- [ ] **7.10 Thin `LiveRatesPanel.tsx`** (viewMode via `useViewModePreference()`; category `filter` `useState` stays; all `localStorage`/`readStoredViewMode`/`handleViewChange` removed).
- [ ] **7.11 Contract fakes stateful** (`world.ts` gains `theme`/`viewMode` HookValues; `hooksFromWorld` reactive `useThemePreference`/`useViewModePreference` pushing to World; `render.tsx` flips to `<HooksProvider><ThemeProvider>`; `ThemeToggle.contract.spec` stays green via stateful fake). **7.12 Visual fakes** (static, `AppData` gains `theme?`/`viewMode?`; flip harness provider nesting).
- [ ] **7.13 Verify + gate:** `@rtc/domain test`, `test:app`, `test:ui:contract`, `typecheck`; `grep -rn "localStorage" packages/client/src/ui` → **zero**. Commit `refactor(client): route theme + viewMode persistence through PreferencesPort (no localStorage in ui)`.

---

## Phase 8 — Residual orchestration → presenters

**Depends on Phase 6 (Promise commands) + Phase 0 (`useMachine`).** Fold `NewRfqForm` confirmation/redirect + `TradeTicket` submit/pass into `RfqsPresenter` as per-instance factory machines exposed via `useMachine`. `REDIRECT_DELAY_MS=1500` becomes RxJS `timer` (presenter constant). Draft inputs stay.

- [ ] **8.1 `RfqsPresenter.createSubmission()`** → `{ state$ (editing|submitting|confirmed{rfqId}), submit(input,onRedirect), dispose }`: `createRfq` → `confirmed` + `timer(REDIRECT_DELAY_MS)`→`onRedirect(rfqId)`. **Include the `submitting` state** to preserve the in-flight button label (REFACTOR fidelity). Marble test (`TestScheduler`): editing→submitting→confirmed; `onRedirect` at exactly 1500ms (1499 not, 1500 yes); `dispose` before delay cancels. Commit `feat(client): RfqsPresenter submission machine (create→confirm→redirect via RxJS timer)`.
- [ ] **8.2 `RfqsPresenter.createTicketSubmission()`** → `{ state$ ({submitted}), submitPrice(quoteId,price), pass(quoteId), dispose }` reusing `quoteRfq`/`passQuote`. Marble/unit test. Commit `feat(client): RfqsPresenter ticket submission machine`.
- [ ] **8.3 Seam** `useRfqSubmission()` + `useTicketSubmission()` via `useMachine(() => presenters.rfqs.createSubmission())` / `createTicketSubmission()`.
- [ ] **8.4 Thin `NewRfqForm.tsx`** (draft inputs stay; `submission.submit(input, onCreated)`; confirmation renders on `status==="confirmed"`; no `rxjs`/`setTimeout`). **8.5 Thin `TradeTicket.tsx`** (price draft + `parseFloat` guard stay; `ticket.submitPrice`/`ticket.pass`; `submitted` from `ticket.state`; no `rxjs`).
- [ ] **8.6 Fakes** (contract: stateful per-mount submission stores recording to `world.commands` + flipping state; `useRfqSubmission` schedules `onRedirect` via `setTimeout(...,1500)` so the fake honours the fake-timer spec; visual: static `rfqSubmission?`/`ticketSubmission?`).
- [ ] **8.7 Verify:** `test:app`+`test:ui:contract`+`typecheck`; `grep -rn "from \"rxjs\"\|firstValueFrom" .../NewRfqForm.tsx .../TradeTicket.tsx` → zero; `grep -rn "setTimeout" packages/client/src/ui/credit` → zero. Commit `refactor(client): move NewRfqForm + TradeTicket orchestration into RfqsPresenter (dumb components)`.

---

## Phase 9 — Visual: un-exclude + inject tile/rfq/stale states

**Depends on Phases 0–4** (thin components + injectable seam). Only `tests/**` + visual harness change.

- [ ] **9.1 `AppData` contract** (`shared/appData.ts`): add `tileExecution: Record<string,TileExecutionState>`, `rfqTile: Record<string,RfqTileState>`, `stale: Record<string,boolean>` (+ neutral state types + empty-record defaults so existing fixtures/goldens are unchanged).
- [ ] **9.2 `buildFakeHooks`** returns `useTileExecution`/`useRfqTile`/`useStaleFlag` reading injected per-symbol state (no-op intents); keep `: AppHooks` return annotation (drift guard).
- [ ] **9.3 Remove the four excludes** (`RfqCountdown`/`TileConfirmation`/`TileRfq`/`StaleIndicator`) from `vitest-browser.coverage.config.ts`.
- [ ] **9.4 Fixtures** (`shared/fixtures.ts`, reuse `eurusd`/`eurusdPrice`): 7 execution arms (started/tooLong/timeout + finished×{Done,Rejected,CreditExceeded,Timeout} with a Done trade), 4 RFQ arms (requested/received@7000ms/received-low@2000ms[straddling the countdown colour threshold]/rejected), 1 stale. **9.5 Scenarios** (`shared/scenarios.ts`): 12 entries, all `componentKey:"Tile"`, no `scenarioActions` (static injected). **9.6 CT specs** (`playwright-ct/tile.spec.tsx` append 11 + new `stale.spec.tsx`).
- [ ] **9.7 Generate LOCAL goldens** (`pnpm build` then the 3 `:update` scripts; re-run without `:update` → stable; `git status` confirms only `react-local/linux-arm64` PNGs, no `react/`).
- [ ] **9.8 Refresh** `COVERAGE-GAPS.md` (move the 4 components to a "Closed by Phase 9" section + new %; drop deleted-hook rows) + `README.md` (Coverage/Excluded sections). **9.9** `typecheck` + commit `test(visual): un-exclude tile/rfq/stale components, inject states + local goldens`.

---

## Phase 10 — Gates + final verification

Only `tests/scripts/grep-gates.ts` (+ residual note). Gate script cwd = `tests/`, paths `../packages/...`.

- [ ] **10.1** Confirm current gate count (25) + no existing `src/ui` gate (extend if one was added earlier).
- [ ] **10.2 Add 4 Dumb-UI gates** (excludes `/src/ui/hooks/`): **26** no `rxjs`/`@react-rxjs` import in `src/ui`; **27** no `localStorage`; **28** no `fetch(`/`import.meta.env`; **29** custom check: the only `setTimeout`/`setInterval` in `src/ui` is `BlotterRow.tsx` (grep, filter `/blotter/BlotterRow.tsx:`, fail on any other offender).
- [ ] **10.3** `pnpm --filter @rtc/tests gates` → all 29 PASS. (A red gate = a real `src/` leak to fix in its production phase, never suppress.)
- [ ] **10.4 Thin-component evidence** (grep the 4 un-excluded components + `Tile`/`AnalyticsPanel`/`AdminPanel` for `rxjs`/timers/`localStorage`/`fetch`/env/deleted-hook imports → empty) + confirm the 7 hook files are deleted.
- [ ] **10.5 Full verification:** `pnpm build`+`typecheck`; `@rtc/domain test`+`test:coverage` (machines + AdminPort/PreferencesPort contracts ~100%); `@rtc/server test`+`test:coverage`; `@rtc/client test:app`+`test:app:coverage`+`test:ui:contract`+`test:ui:visual:react`+`test:ui:visual:vitest-browser:react:coverage`; `gates`; presenter peers; `test:e2e` (Cypress busy-spins on aarch64 → Playwright suites locally, Cypress CI-only; visual `react/` lags the workflow — both documented expected reds).
- [ ] **10.6 Residual note** (`COVERAGE-GAPS.md` or STATUS): visual `src/ui/**/*.tsx` delta, app/domain machine+presenter coverage (~100%), the two expected reds, and confirmation gates 26–29 hold. Commit `test(arch): gate src/ui against rxjs/localStorage/fetch/env + lone-setTimeout; final verification`.

---

## Final verification (whole workstream)

```bash
# Dumb-UI gates (the enforcement)
pnpm --filter @rtc/tests gates                         # 29 gates incl. 26-29
grep -rn 'from "rxjs"\|@react-rxjs' packages/client/src/ui | grep -v '/src/ui/hooks/'   # empty
grep -rn 'localStorage\|fetch(\|import.meta.env' packages/client/src/ui | grep -v '/src/ui/hooks/'  # empty
grep -rnE '\bsetTimeout\b|\bsetInterval\b' packages/client/src/ui | grep -v 'BlotterRow.tsx'  # empty
# 7 hooks deleted
ls packages/client/src/ui/fx/liveRates/tile/hooks/ packages/client/src/ui/shell/stale/ packages/client/src/ui/admin/hooks/ 2>/dev/null  # gone
# Suites (faithfulness guardrail)
pnpm build && pnpm typecheck
pnpm --filter @rtc/domain test && pnpm --filter @rtc/server test
pnpm --filter @rtc/client test:app && pnpm --filter @rtc/client test:ui:contract && pnpm --filter @rtc/client test:ui:visual:react
pnpm --filter @rtc/tests test:fullstack:node && pnpm --filter @rtc/tests test:fullstack:browser
```

Expected: all green except the visual CI `react/` job (until `update-visual-goldens` runs) and any Cypress-bound e2e suite (CI-only on aarch64) — both documented, expected reds.

## Notes for the implementer
- **Refactor, not feature:** a new test pins relocated behaviour; the e2e/presenter/full-stack suites prove behaviour is unchanged — run them at phase boundaries.
- **Provider-nesting flip** (Phase 7) is the highest breakage risk — do it with the thinned `ThemeProvider` and in every harness.
- **Delete an old hook only after** its replacement is wired + behaviour-verified; re-home its exported types in the same phase.
- **No production `src/` edits in Phases 9–10** (components already thinned); adjust the harness to match the real seam, never the reverse.

