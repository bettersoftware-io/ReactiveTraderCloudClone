# Restore Dumb-UI across the client: relocate logic out of React components — Design

**Date:** 2026-06-16

**Status:** Approved (brainstorming) — ready for implementation plan

## Goal

Enforce the architecture's **Dumb-UI** rule by relocating all business logic,
orchestration, transport, and timers that currently live in **seven** React-local
hooks out of the UI layer:
- the six tile/stale hooks → **client presenter-layer RxJS state machines**;
- the admin `useThroughput` hook → a proper **`AdminPort` + WS adapter + presenter**
  (it additionally does raw HTTP transport, so it needs a port, not just a machine).

All seven are exposed to components through the **single `AppHooks` seam** via one
new, logic-free bridge hook. The UI layer ends up containing no business logic,
no transport awareness, no orchestration, and no `rxjs` — only rendering and
intent emission.

## Why (the violation)

`docs/architecture.md` is explicit:
- §1.2 Principle 3 *Dumb UI*: "The UI layer renders state and emits intents. It
  contains **no business logic, no transport awareness, and no orchestration**."
- Layer table: the UI Layer "Consumes the Application Layer through **hook
  contracts only**. Never imports `rxjs`."
- §3.4 (line ~590): use cases are "the home for application-specific
  orchestration and enrichment **that today leaks into client hooks**."

`packages/client/src/ui/fx/liveRates/tile/Tile.tsx` violates this: it reads
global streams through the seam (`usePrice`, `usePriceHistory`) but imports six
**logic-bearing** hooks directly:

| Hook | Shape | Logic that must leave the UI |
|---|---|---|
| `useTileState` | per-tile execution **state machine** + 3 timers (tooLong/timeout/dismiss) | transitions + `@rtc/domain` timing |
| `useRfqState` | per-tile RFQ **state machine** + 100ms countdown + reject timer | transitions + countdown |
| `useStaleDetection` | per-stream derived flag (connection × value) | the "disconnected→reconnected→no-new-value" rule |
| `useNotional` | per-input form reducer (rules already in `@rtc/domain`) | reducer + formatting |
| `useExecuteTrade` | **orchestration** (start→execute→finish/timeout) | folds into the tile machine |
| `useRfqQuote` | **orchestration** (initiate→request→receive/reject) | folds into the RFQ machine |
| `useThroughput` | **raw HTTP transport** (`fetch` GET/PUT `${VITE_SERVER_HTTP_URL}/throughput`) + debounce/dismiss timers + loading/message state | the whole hook → `AdminPort` + adapter + presenter |

`useThroughput` (imported by `AdminPanel.tsx`) is the most severe: it breaks
*two* Dumb-UI clauses — orchestration **and** transport awareness — talking HTTP
on a side-channel that bypasses the entire ports/presenters/WS stack the rest of
the app uses. The server already exposes throughput over WS
(`admin.getThroughput`/`admin.setThroughput`, in the protocol + `wsHandler` +
already contract-tested), so the fix also removes a WS-vs-HTTP duplication.

`useStaleDetection` has **two** consumers — `Tile.tsx` **and**
`AnalyticsPanel.tsx` — so its migration touches both (it is a shell-level hook,
not tile-only).

Out of scope: `useTheme`/`ThemeProvider` (dark/light + `localStorage`) is a pure
**presentation** concern — not domain/app logic or transport — so it
legitimately stays in the UI layer.

This leak is also the **root cause of the visual-coverage pain**: because the
timer/state-machine logic lives in the UI, the only place it runs is the browser
visual tier, where wall-clock timers make states non-deterministic — which is why
`RfqCountdown`/`TileConfirmation`/`TileRfq`/`StaleIndicator` were excluded from
the visual coverage denominator. Moving the logic to RxJS dissolves that: the
machines become marble-testable (deterministic `TestScheduler` time), and the
components become thin shells whose every state can be injected as a static fake.

## Approach (Option 1 — single seam, locked)

Three coordinated pieces:

### 1. App-layer RxJS machine factories (`packages/client/src/app/presenters/`)
Each relocated hook becomes a **per-instance factory** — a vanilla function (no
React) returning `{ state$, ...intents }`:
- `state$` is a react-rxjs `state()` (a `StateObservable` with a synchronous
  current value), so the bridge can read it without a manual snapshot cache.
- Intents are plain methods that push onto internal `Subject`s.
- **Timers become RxJS** (`timer`, `interval`, `delay`, `takeUntil`,
  `switchMap`, `scan`) — never `setTimeout`/`setInterval`/`Date.now` — so the
  whole machine is deterministic under `TestScheduler`.
- Command/stream **dependencies are injected** at construction (the execute
  command, the request-quote command, `connection.status$`, `priceStream`), so
  the orchestration wrappers (`useExecuteTrade`/`useRfqQuote`) **fold into** the
  machines rather than surviving as separate UI hooks.

Four machines (the two orchestration hooks are absorbed):
- **`createTileExecutionMachine(pair, deps)`** — absorbs `useTileState` +
  `useExecuteTrade`. Intents: `execute(direction, price, notional)`, `dismiss()`.
  State: `{ status: "ready" | "started" | "tooLong" | "finished" | "timeout"; … }`.
  Internally calls the injected execute command, drives tooLong/timeout/dismiss
  via RxJS time, maps result/error to `finished`/`timeout`.
- **`createRfqTileMachine(pair, deps)`** — absorbs `useRfqState` + `useRfqQuote`.
  Intents: `requestQuote()`, `cancel()`, `reject()`, `accept()`. State:
  `{ status: "init" | "requested" | "received" | "rejected"; quote; remainingMs }`.
  Internally calls the injected request-quote command; runs the countdown +
  reject-display timing via RxJS.
- **`createStaleFlagMachine(pair, deps)`** — replaces `useStaleDetection`.
  Derives `stale$: boolean` from injected `connection.status$` combined with
  `priceStream.price$(pair)` (the value stream) — no value passed from the
  component. Pure stream derivation (`combineLatest` + `scan`).
- **`createNotionalMachine(defaultNotional)`** — replaces `useNotional`. Intents:
  `change(input)`, `reset()`. State:
  `{ displayValue, numericValue, error, isRfq, isDefault }`. Uses the existing
  `@rtc/domain` rules (`parseNotional`, `isRfqRequired`) + comma formatting. No
  timers; a pure reducer over the intents.

**Timing-constant home:** domain-semantic constants stay in `@rtc/domain`
(`TOO_LONG_THRESHOLD_MS`, `EXECUTION_TIMEOUT_MS`, `CONFIRMATION_DISMISS_MS`). The
currently UI-local timing literals move to where they belong: `RFQ_TIMEOUT_MS`
and `REJECTED_DISPLAY_MS` (RFQ display semantics) → `@rtc/domain`; the 100 ms
countdown repaint cadence is pure UI refresh rate and stays a presenter constant.

### 2. One new bridge hook (`packages/client/src/ui/hooks/useMachine.ts`)
A thin, **logic-free** bridge that lives in the sanctioned react-rxjs bridge
layer (the one place allowed to touch `Observable`, exactly like
`createAppHooks`'s use of `bind`):
- Instantiates the factory **once per mount** (`useMemo`/lazy `useRef`).
- Reads `machine.state$` via react-rxjs `useStateObservable` (or
  `useSyncExternalStore` as a fallback).
- Returns `{ state, ...intents }` with stable intent references.
- Disposes the machine (completes its `Subject`s / tears down subscriptions) on
  unmount.

Components **never import `useMachine`** — it is an implementation detail of the
seam (see piece 3). It is the only new UI primitive, and a SolidJS port writes
its own one-line equivalent.

### 3. Extend the single `AppHooks` seam (`createAppHooks.ts`)
Add per-instance hooks alongside the existing global-stream hooks, each
implemented by `useMachine` over an injected factory:
- `useTileExecution(pair): { state, execute, dismiss }`
- `useRfqTile(pair): { state, requestQuote, cancel, reject, accept }`
- `useStaleFlag(pair): boolean`
- `useNotional(defaultNotional): { displayValue, numericValue, error, isRfq, isDefault, change, reset }`
- `useThroughput(): { value, loading, message, setValue }` (backed by the
  ThroughputPresenter over the AdminPort — see piece 4)

The composition root passes factory creators (bound to their command/stream
deps) into `createAppHooks`, e.g. `useTileExecution: (pair) => useMachine(() =>
factories.tileExecution(pair))`. Components still only ever call `useHooks()` —
**one contract, one framework-swap point, one test/snapshot injection point.**

### 4. Admin throughput → `AdminPort` over WS (transport, not just a machine)

`useThroughput` is migrated through the **full ports/presenters stack** like every
other transport concern, not as a UI machine:
- **`AdminPort`** (`@rtc/domain/ports`): `getThroughput(): Observable<number>` +
  `setThroughput(value: number): Observable<void>`.
- **WsReal adapter** (`packages/client/src/app/adapters/`): implements `AdminPort`
  via `wsAdapter.rpc("admin.getThroughput")` / `rpc("admin.setThroughput", { value })`
  — the RPCs already exist in `protocol.ts` + `wsHandler` and are contract-tested.
- **Simulator adapter** (`@rtc/domain/simulators`, e.g. `ThroughputSimulator`):
  in-memory get/set, for sim mode (the app's default in dev). Pinned by the same
  port-contract pattern as the other 8 ports (so this becomes the 9th port).
- **`portFactory`** wires `admin` into both `createWsRealPorts` and
  `createSimulatorPorts`.
- **`ThroughputPresenter`** (`packages/client/src/app/presenters/`, RxJS): holds
  the `value`/`loading`/`message` state and the debounce + message-dismiss timing
  **as RxJS** (`debounceTime`, `timer`) over a `setValue` intent; reads initial
  value via `AdminPort.getThroughput()`; maps set success/failure to the message.
  Marble-tested.
- **Seam:** `AppHooks.useThroughput()` binds the presenter (a shared/global
  presenter via react-rxjs `bind`, or `useMachine` if kept per-mount).
- **`AdminPanel.tsx`** becomes thin (reads `useHooks().useThroughput()`); the raw
  `fetch`, the `VITE_SERVER_HTTP_URL` read, and the debounce/dismiss `setTimeout`s
  leave the UI entirely.
- **Transport unification:** the client no longer uses HTTP at all. The server's
  HTTP `GET/PUT /throughput` route (in `src/index.ts`) becomes dead code; this
  workstream **removes it** (small `index.ts` edit) so WS is the single transport.
  `VITE_SERVER_HTTP_URL` is removed from the client env usage.

Timing constants: `DEBOUNCE_MS` / `MESSAGE_DISMISS_MS` move to the presenter (UI
feedback cadence) or `@rtc/domain` if deemed domain-semantic — decided in the plan.

### Result — thin components
`Tile.tsx` reduces to: read `usePrice`/`usePriceHistory`/`useStaleFlag`/
`useNotional`/`useTileExecution`/`useRfqTile` from the seam, compute trivial
view-derivations (`isLoading`, `isBusy`, …), and render sub-components by
`state.status`. It imports no local hooks, no `rxjs`, no timers. The leaf
components (`RfqCountdown`, `TileConfirmation`, `TileRfq`, `StaleIndicator`) are
already pure and unchanged. `AnalyticsPanel.tsx` (the other `useStaleDetection`
consumer) and `AdminPanel.tsx` likewise drop to reading the seam only. All seven
hook files + their `*.test.tsx` are deleted (their logic now lives in
marble-tested machines/presenters).

## Scope expansion — inline component logic (no extracted hook)

A full `src/ui` audit (objective signals: direct `rxjs` / `localStorage` /
`fetch` / `setTimeout` / `import.meta.env`) found logic living **inline** in
components (not in a hook file) that also violates Dumb-UI. The rule applied:
**move everything except transient view state pertinent to that one component**
(dropdown open, hover, active tab, controlled-input draft, pure-function
composition over local state). Confirmed findings:

### 5. Seam commands must return `Promise`, not `Observable` (kills `rxjs` in UI)
`RfqTilesPanel.tsx`, `NewRfqForm.tsx`, and `TradeTicket.tsx` import `rxjs`
(`firstValueFrom`) because the `AppHooks` command callbacks are typed
`=> Observable<T>` (the seam literally tells callers to `firstValueFrom` them).
**Fix (systemic):** change the seam's command callbacks to `=> Promise<T>` — the
**bridge** (`createAppHooks`) performs the `firstValueFrom` internally. Then no
component imports `rxjs`. This is the single change that clears the violation in
all three components. (Commands: `useExecuteTrade`, `useCreateRfq`,
`useAcceptQuote`, `useCancelRfq`, `usePassQuote`, `useQuoteRfq`,
`useRequestRfqQuote` — all flip `Observable` → `Promise` at the seam.)

### 6. `PreferencesPort` — no `localStorage` in the UI
`LiveRatesPanel.tsx` (viewMode) and `ThemeProvider.tsx` (theme) read/write
`localStorage` directly. Introduce a **`PreferencesPort`** (`@rtc/domain`):
`getTheme()/setTheme()`, `getViewMode()/setViewMode()` (or a small generic
get/set keyed contract) with a **localStorage adapter** (client) + an in-memory
adapter (sim/tests), behind presenters bound to the seam
(`useThemePreference`, `useViewModePreference`). The theme **toggle UI** stays in
`ThemeProvider`; the **persistence** leaves. `LiveRatesPanel`'s category filter
**stays** (transient). After this, `localStorage` appears nowhere in `src/ui`.

### 7. Residual orchestration → presenters
- **`NewRfqForm.tsx`** — the post-submit confirmation + `setTimeout(1500)`
  redirect is timing/orchestration → move to a presenter (e.g. fold into
  `RfqsPresenter` or a small `RfqSubmissionPresenter`); the form **draft inputs**
  (instrument/direction/quantity/dealers/submitting) **stay**.
- **`TradeTicket.tsx`** — the submit/pass orchestration + `submitted` response
  flag → presenter; the **price draft input stays**.
- **`RfqTilesPanel.tsx`** — its orchestration is cleared by the seam→`Promise`
  change (§5); `filter` + `dismissed` **stay** (transient).

### STAY (transient view state — explicitly left in the UI)
`App` active tab · `CreditWorkspace` view · `InstrumentSearch` query/open + pure
client-side result filtering (user-approved) · `RfqTilesPanel` filter/dismissed ·
`BlotterHeader` popover-open · `BlotterRow` hover + 3 s highlight-fade animation ·
`Date/Number/Set` filter draft inputs · `FxBlotter` sort/filter/quick-filter
state composing the already-pure `columnSort.ts`/`filterState.ts` (no
persistence/transport/timers). `setTimeout` for the `BlotterRow` highlight is a
pure animation and stays; no other component-level `setTimeout` survives.

## Testing strategy

- **App layer (new home of the logic):** marble tests with `TestScheduler` for
  each of the four tile/stale machines **and** the `ThroughputPresenter` — every
  transition, timeout, countdown tick, debounce, and error path, deterministically.
  Plus the `AdminPort` port-contract test (simulator vs WsReal). This is where
  coverage of the timing/transport logic now lives (and it can reach ~100% because
  RxJS time is virtual).
- **Bridge:** one focused test for `useMachine` (mount instantiates, state
  updates propagate, intents passthrough, unmount disposes).
- **UI layer:** the existing **contract tier** (sociable RTL) already covers the
  thin components and keeps them framework-neutral; **visual** goldens now snapshot
  every tile/RFQ/confirmation/stale state by injecting it through `buildFakeHooks`
  (the fake `AppHooks`), so the four previously-excluded components are
  **un-excluded** from the visual coverage denominator and gain real goldens — no
  fake timers anywhere.
- **Behavioural guardrail:** the presenter + e2e/full-stack behavioural suites
  must stay green throughout — observable behaviour is unchanged; only the layer
  the logic lives in changes. These suites are the proof the migration is
  faithful.

## Fakes (`buildFakeHooks` for visual + contract tiers)

The fake `AppHooks` gains static implementations of the five new seam hooks
(`useTileExecution`/`useRfqTile`/`useStaleFlag`/`useNotional`/`useThroughput`)
that return injected state + no-op intents, e.g.
`useTileExecution: () => ({ state: appData.tileExecution ?? { status: "ready" }, execute: noop, dismiss: noop })`.
This lets a scenario render any tile state directly (started / tooLong / timeout /
finished×status / RFQ received-with-countdown / stale) — the clean total
swap that Option 1 uniquely preserves.

## Non-goals

- No change to observable app behaviour (transitions, timings, outcomes identical).
- No change to the global-stream hooks or the presenters that already exist.
- No `rxjs` in the UI layer except the sanctioned `useMachine` bridge (mirrors
  the existing react-rxjs `bind` exception).
- No new CI gates; no `turbo.json`/`@rtc/shared` changes. (Transport DOES change:
  admin throughput moves from HTTP to the existing WS admin RPCs; the server's
  HTTP `/throughput` route is removed.)
- `useTheme`/`ThemeProvider`'s **toggle UI** stays in the UI; only its
  `localStorage` persistence moves (to `PreferencesPort`).
- Transient view state stays (see the STAY list): active tab, view routing,
  dropdown/popover open, hover, filter draft inputs, `FxBlotter` sort/filter,
  `InstrumentSearch` query/filter, `BlotterRow` highlight animation.
- The fake-timer "integrated-tile" visual scenarios proposed earlier are dropped
  — this refactor makes them unnecessary.

## Success criteria

1. All seven hooks (`useTileState`, `useRfqState`, `useStaleDetection`,
   `useNotional`, `useExecuteTrade`, `useRfqQuote`, `useThroughput`) are deleted
   from the UI layer; their logic lives in four marble-tested RxJS machines + the
   `ThroughputPresenter` in `packages/client/src/app/`, and (for throughput) an
   `AdminPort` + adapters.
2. `Tile.tsx`, `AnalyticsPanel.tsx`, and `AdminPanel.tsx` import no local logic
   hooks, no `rxjs`, no timers, no `fetch`/env; all state comes through `useHooks()`.
3. `AppHooks` exposes `useTileExecution` / `useRfqTile` / `useStaleFlag` /
   `useNotional` / `useThroughput`; `useMachine` is the only new UI primitive and
   is not imported by components.
4. Each machine + the `ThroughputPresenter` has marble tests covering all
   transitions/timeouts/countdown/debounce (deterministic `TestScheduler`); the
   new `AdminPort` has a simulator-vs-WsReal port-contract test. The relocated
   logic reaches ~100% in the app coverage tier.
5. The visual coverage config **un-excludes** `RfqCountdown`, `TileConfirmation`,
   `TileRfq`, `StaleIndicator`; scenarios inject their states via `buildFakeHooks`
   and commit goldens (local `react-local/<arch>`; CI `react/` via the
   `update-visual-goldens` workflow).
6. Admin throughput rides the WS admin RPCs end to end; the client makes no HTTP
   calls; the server's HTTP `/throughput` route + the client `VITE_SERVER_HTTP_URL`
   usage are removed; the full-stack smokes still pass.
7. All existing suites stay green: domain, server, client `test:app` /
   `test:ui:contract` / `test:ui:visual:react`, and the presenter + e2e
   behavioural suites (the faithfulness guardrail).
8. UI-layer gate holds: no `rxjs` import in `src/ui/**` except `src/ui/hooks/`
   (the bridge layer). Confirm/extend the existing architecture grep-gate.
9. Seam commands return `Promise<T>` (not `Observable<T>`); `RfqTilesPanel`,
   `NewRfqForm`, `TradeTicket` no longer import `rxjs`.
10. No `localStorage` anywhere in `src/ui` — theme + viewMode persistence go
    through `PreferencesPort`; only the toggle UIs remain. Extend the grep-gate to
    assert no `localStorage`/`fetch`/`import.meta.env` in `src/ui` (the bridge +
    composition root excepted).
11. The only `setTimeout` remaining in `src/ui` is the `BlotterRow` highlight
    animation; `NewRfqForm`/`TradeTicket` timing+orchestration moved to presenters.

## Decomposition (phases — one workstream, sequential)

1. **Phase 0 — `useMachine` bridge** (+ its test). The shared primitive.
2. **Phase 1 — TileExecution machine** (absorbs `useTileState` + `useExecuteTrade`):
   factory + marble tests → seam method → `buildFakeHooks` → thin `Tile.tsx`
   execution wiring → delete `useTileState.ts`/`useExecuteTrade.ts` + tests.
3. **Phase 2 — RfqTile machine** (absorbs `useRfqState` + `useRfqQuote`): same
   shape; delete the two hooks + tests.
4. **Phase 3 — StaleFlag machine** (replaces `useStaleDetection`): thin both
   `Tile.tsx` **and** `AnalyticsPanel.tsx`; delete the hook + test.
5. **Phase 4 — Notional machine** (replaces `useNotional`): delete the hook + test.
6. **Phase 5 — Throughput over WS** (the port-shaped one): `AdminPort` (domain) +
   `ThroughputSimulator` + port-contract test → WsReal admin adapter →
   `portFactory` wiring → `ThroughputPresenter` (+ marble tests) → seam
   `useThroughput` + fake → thin `AdminPanel.tsx` → delete `useThroughput.ts` +
   test → remove server HTTP `/throughput` + client `VITE_SERVER_HTTP_URL`.
   Verify with the full-stack smokes.
7. **Phase 6 — Seam commands → `Promise`**: flip the `AppHooks` command
   callbacks from `Observable<T>` to `Promise<T>` (bridge absorbs `firstValueFrom`);
   remove `rxjs` from `RfqTilesPanel`/`NewRfqForm`/`TradeTicket`; update fakes.
8. **Phase 7 — `PreferencesPort`**: domain port + localStorage adapter +
   in-memory adapter + port-contract test → `ThemePreference`/`ViewModePreference`
   presenters → seam hooks → thin `ThemeProvider` (toggle only) + `LiveRatesPanel`
   (no `localStorage`); remove all `localStorage` from `src/ui`.
9. **Phase 8 — Residual orchestration**: move `NewRfqForm` confirmation/redirect
   timing and `TradeTicket` submit/pass orchestration into presenters; components
   keep only draft inputs.
10. **Phase 9 — Visual**: un-exclude the four components, add state scenarios +
    goldens, refresh `COVERAGE-GAPS.md`/`README.md`.
11. **Phase 10 — Gates + final verification**: extend the architecture grep-gate
    (no `rxjs`/`localStorage`/`fetch`/`import.meta.env` in `src/ui` outside the
    bridge); all suites green; thin-component check; coverage deltas reported.

Each phase keeps the app building and the behavioural suites green (the migration
is incremental — one machine/port at a time, old code deleted only once its
replacement is wired and behaviour-verified).
