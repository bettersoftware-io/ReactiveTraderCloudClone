# Restore Dumb-UI: move tile/stale interaction logic into RxJS machines — Design

**Date:** 2026-06-16

**Status:** Approved (brainstorming) — ready for implementation plan

## Goal

Enforce the architecture's **Dumb-UI** rule for the FX tile by relocating all
business logic, orchestration, and timers that currently live in six React-local
hooks into the **client application (presenter) layer as vanilla RxJS state
machines** — exposed to components through the **single `AppHooks` seam** via one
new, logic-free bridge hook. The UI layer ends up containing no state machines,
no timers, no orchestration, and no `rxjs` — only rendering and intent emission.

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

The composition root passes factory creators (bound to their command/stream
deps) into `createAppHooks`, e.g. `useTileExecution: (pair) => useMachine(() =>
factories.tileExecution(pair))`. Components still only ever call `useHooks()` —
**one contract, one framework-swap point, one test/snapshot injection point.**

### Result — thin components
`Tile.tsx` reduces to: read `usePrice`/`usePriceHistory`/`useStaleFlag`/
`useNotional`/`useTileExecution`/`useRfqTile` from the seam, compute trivial
view-derivations (`isLoading`, `isBusy`, …), and render sub-components by
`state.status`. It imports no local hooks, no `rxjs`, no timers. The leaf
components (`RfqCountdown`, `TileConfirmation`, `TileRfq`, `StaleIndicator`) are
already pure and unchanged. The six hook files + their `*.test.tsx` are deleted
(their logic now lives in marble-tested machines).

## Testing strategy

- **App layer (new home of the logic):** marble tests with `TestScheduler` for
  each of the four machines — every transition, timeout, countdown tick, and
  error path, deterministically. This is where coverage of the timing logic now
  lives (and it can reach ~100% because RxJS time is virtual).
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

The fake `AppHooks` gains static implementations of the four new seam hooks that
return injected state + no-op intents, e.g.
`useTileExecution: () => ({ state: appData.tileExecution ?? { status: "ready" }, execute: noop, dismiss: noop })`.
This lets a scenario render any tile state directly (started / tooLong / timeout /
finished×status / RFQ received-with-countdown / stale) — the clean total
swap that Option 1 uniquely preserves.

## Non-goals

- No change to observable app behaviour (transitions, timings, outcomes identical).
- No change to the global-stream hooks or the presenters that already exist.
- No `rxjs` in the UI layer except the sanctioned `useMachine` bridge (mirrors
  the existing react-rxjs `bind` exception).
- No new CI gates; no `turbo.json`/transport/`@rtc/shared` changes.
- No migration of hooks outside the tile/stale set (this workstream is those six).
- The fake-timer "integrated-tile" visual scenarios proposed earlier are dropped
  — this refactor makes them unnecessary.

## Success criteria

1. The six hooks (`useTileState`, `useRfqState`, `useStaleDetection`,
   `useNotional`, `useExecuteTrade`, `useRfqQuote`) are deleted from the UI layer;
   their logic lives in four marble-tested RxJS machines in
   `packages/client/src/app/presenters/`.
2. `Tile.tsx` and the tile subtree import no local logic hooks, no `rxjs`, no
   timers; all interaction state comes through `useHooks()`.
3. `AppHooks` exposes `useTileExecution` / `useRfqTile` / `useStaleFlag` /
   `useNotional`; `useMachine` is the only new UI primitive and is not imported by
   components.
4. Each machine has marble tests covering all transitions/timeouts/countdown
   (deterministic `TestScheduler`); the four machines reach ~100% in the app
   coverage tier.
5. The visual coverage config **un-excludes** `RfqCountdown`, `TileConfirmation`,
   `TileRfq`, `StaleIndicator`; scenarios inject their states via `buildFakeHooks`
   and commit goldens (local `react-local/<arch>`; CI `react/` via the
   `update-visual-goldens` workflow).
6. All existing suites stay green: domain, server, client `test:app` /
   `test:ui:contract` / `test:ui:visual:react`, and the presenter + e2e
   behavioural suites (the faithfulness guardrail).
7. UI-layer gate holds: no `rxjs` import in `src/ui/**` except `src/ui/hooks/`
   (the bridge layer). Confirm/extend the existing architecture grep-gate.

## Decomposition (phases — one workstream, sequential)

1. **Phase 0 — `useMachine` bridge** (+ its test). The shared primitive.
2. **Phase 1 — TileExecution machine** (absorbs `useTileState` + `useExecuteTrade`):
   factory + marble tests → seam method → `buildFakeHooks` → thin `Tile.tsx`
   execution wiring → delete `useTileState.ts`/`useExecuteTrade.ts` + tests.
3. **Phase 2 — RfqTile machine** (absorbs `useRfqState` + `useRfqQuote`): same
   shape; delete the two hooks + tests.
4. **Phase 3 — StaleFlag machine** (replaces `useStaleDetection`): delete the hook + test.
5. **Phase 4 — Notional machine** (replaces `useNotional`): delete the hook + test.
6. **Phase 5 — Visual**: un-exclude the four components, add state scenarios +
   goldens, refresh `COVERAGE-GAPS.md`/`README.md`.
7. **Final verification**: all suites green; UI `rxjs` gate; thin-component check;
   coverage deltas reported.

Each phase keeps the app building and the behavioural suites green (the migration
is incremental — one machine at a time, old hook deleted only once its
replacement is wired and behaviour-verified).
