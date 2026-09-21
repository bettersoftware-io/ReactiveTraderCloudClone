# Pluggable Application Core — Slice 4 (Equities) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the five equities presenters — `watchlist`, `candleSeries`, `depth`, `ordersBlotter`, `positions` — and the three equities machines — the two composition singletons `eqWorkspace` and `eqDrawings`, and the per-mount `orderTicket` — a behavioural contract suite each (green on the RxJS core first), then a native implementation in both alternative cores, so `pnpm core:parity` reads 44/74 for each core.

**Architecture:** Three PRs. **PR A (Tasks 1–3, "the RxJS side")** extracts the equities state transitions out of the RxJS machines into pure, exported folds in `@rtc/client-core` (`reduceEqWorkspace`, `reduceEqDrawings`, `reduceOrderTicket`, `stitchCandles` — "pure reducers are imported, never duplicated"), moves the one cadence the suites need into `@rtc/domain`, adds the strangler seam `createApp(ports, seams)` so the base app's internal consumers (`JarvisDriverMachine`, `AnimationDirector`) can be pointed at a sibling's native `eqWorkspace` and `fills$`, extends the `@rtc/core-contract` harness with scripted equities ports and a seedable watchlist, and lands the eight suites. **PR R (Tasks 4–5, "the run slot")** pays the slice-3 residual before a sixth copy is written: one `createRunSlot` per alternative core replaces the four hand-rolled "one active run" scaffolds and closes the async core's stale-write window class-wide; it touches only the two sibling packages, so it runs in parallel with PR A in its own worktree. **PR B (Tasks 6–8, "the ports")** makes the eight members native: the async core from `Topic`/`Store`/`relay`/`once` plus one new bridge export (`portCallToStream`, a per-call multi-value port stream); the Effect core from `sharedFold`/`mirrorPort`/`rpc`/`SubscriptionRef` plus `scopedPortStream`, `createChildHost` and seven more `GenericTag` layers, one of them dependent (`eqWorkspace` seeds from `watchlist`). Task 8 records receipts and runs the gate: gauntlet + the three-leg e2e matrix.

**Tech Stack:** TypeScript 7 `tsc` (6.x API shim for tooling — see `docs/typescript-7.md`), pnpm 12 workspaces + Turborepo (strict env), vitest 4.1 (fake timers via `vi.useFakeTimers` / `vi.advanceTimersByTimeAsync`), RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2 (`Context`, `Layer`, `SubscriptionRef`, `Stream`, `PubSub`, `Queue`, `Scope`), dependency-cruiser, knip, Playwright.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md) — slice table row "4 equities" (`watchlist`, `candleSeries`, `depth`, `ordersBlotter`, `positions`; machines `eqWorkspace`, `eqDrawings`, `orderTicket` — "the two singletons the World harness instantiates"); "The async/await core" ("Pure reducers … are imported, not duplicated"); "The Effect core" (Tag/Layer composition); "The core-contract tier". Slice 3 shipped as PRs #797 (suites) and #800 (ports) from [`2026-09-20-pluggable-core-slice-3.md`](2026-09-20-pluggable-core-slice-3.md) with its rulings in [`2026-09-20-pluggable-core-slice-3-rulings.md`](2026-09-20-pluggable-core-slice-3-rulings.md); every primitive this slice builds on is as that plan left it. Carried rulings: **R5** burst multiplicity is not contracted (settle between counted emissions); **R8** an event stream's burst IS contracted; equal-state conflation stays uncontracted.

## Global Constraints

- **Exit criterion (spec, "Slices 1a–7"):** suites for the eight members exist and are green on RxJS (PR A); both alternative cores have them native (PR B); the e2e matrix (`test:e2e`, `test:e2e:async`, `test:e2e:effect`) is green — including `tests/browser/scenarios/jarvis.ts`, whose drive batch (`switchTab`, `eqIndicator`, `eqPane`) is the only end-to-end witness that the base `JarvisDriverMachine` reaches the NATIVE `eqWorkspace` (ruling 2); `parity.json` updated in both cores (44/74 each).
- **Ordering rule (spec):** a member's suite is green on RxJS before either alternative core ports it. PR A and PR R both merge before Task 6 or 7 starts; Tasks 6–7 run in a worktree created off the `main` that contains both.
- **Bridge rule:** outside `packages/client-core-{async,effect}/src/bridge/`, `rxjs` and `@rx-state/core` are **type-only** imports (dependency-cruiser `bridge-owns-rxjs` + grep gate 43; `.test.ts` exempt). The only new `Observable` constructions in this slice are the two named bridge exports (`portCallToStream` in the async `bridge/out.ts`; nothing new constructs one in the Effect core — `scopedPortStream` returns an Effect `Stream`). A keep-warm `.subscribe()` on a `StateStream` lives in `bridge/out.ts` too (`storeToWarmStateStream` / `refToWarmStateStream`), never in a machine file. `effect` is importable only inside `packages/client-core-effect/`. Outside `bridge/`, the Effect core reaches `fromObservable` only through a `FromPort` or `scopedPortStream` (`effect-port-subscription-owned-by-the-bridge`).
- **Types-only rule:** `packages/core-api/src` exports no runtime value (grep gate 42). **This slice changes nothing in `@rtc/core-api`** — no member joins the seam (every equities member is already routed through `Presenters`/`MachineFactories`; verified: only the two `viewModelFromWorld.ts` harnesses, `ui-contract`'s `world.ts` and one contract spec import the RxJS factories directly, and those build their own view model and are not the seam). Member count stays 74. `@rtc/core-contract` never imports `@rtc/client-core` (build-order cycle) — a constant the suites need moves to `@rtc/domain` (Task 1), never to `client-core`.
- **Pure reducers and helpers are imported, never duplicated:** `reduceEqWorkspace` + `createEqWorkspaceState` + `firstWatchlistSymbol`, `reduceEqDrawings` + `INITIAL_EQ_DRAWINGS_STATE`, `reduceOrderTicket` + `createOrderTicketAcc` + `createOrderTicketForm` + `validateOrderTicket` + `orderToTicketPhase` + `toPlaceOrderRequest`, `stitchCandles` — all from `@rtc/client-core` (Task 1). A sibling that re-implements one is a review finding.
- **Workspace packages resolve through `dist`** (`exports` → `./dist/index.js`, no vitest alias). A stale `dist` gives a false result in either direction. **Never two builds in one checkout at once** (CLAUDE.md; PR #795's `check-dist` fails the build that observes a truncated `.d.ts` and its message carries the recovery recipe). Parallel implementers on one worktree run NO builds: the controller builds every dist once before dispatching a wave and again at the PR's gauntlet (slice-3 ruling R9). Inside a wave an implementer runs `vitest` only — each package's own tests resolve `#/` from `src`.
- **Shared dep versions must match the repo exactly** (`pnpm check:versions`). This slice adds no dependency.
- **Coverage gates:** each alternative core's `test:coverage` must stay ≥95% statements/lines/functions and ≥85% branches. The contract runner exercises every member through the suites; unit tests cover what the contract cannot see (port release on abort/interrupt, guards, the Layer graph count, the seam wiring).
- **Biome + ESLint:** mandatory braces on every control statement; arrow functions use block bodies with an explicit `return`; zero findings; no `biome-ignore`/`eslint-disable`. `func-style` forbids `const f = () => {}` — named functions are `function` declarations; a `let` holder for a later-assigned closure is declared WITHOUT an initializer. Exported functions carry explicit return types. No inline object type literal in a return-type or parameter position — name an `interface`. A class must name its file (`rtc/class-filename-match`) — the Effect tags stay `Context.GenericTag`. Function names state their effect (`rtc/name-functions-by-effect`); fixture factories are `create*` (`rtc/name-fixture-factories`); test files put tests before helpers (`rtc/newspaper-order`); a large JSON-shaped fixture lives in a `create*` factory below the cases.
- `#/` subpath imports only; never `@/`; ≥2-up relative imports are banned.
- **Port discipline:** an app-lifetime port method (`marketData.watchlist`, `positions.positions`) is called at construction only, in every core; `portDiscipline` gains one constancy case per member. A per-key method (`marketData.quotes/candles/depth`) is called once per key at first request; a per-invocation method (`marketData.candleHistory`, `orders.place`, `orders.orders`) is called per invocation — that IS its contract — and none of those are under the constancy rule.
- **Only the first value is synchronous (slice 1a ruling):** suites assert a subscription's first value in the caller's tick and every later value after `settle()` — or, under the fake clock, after `clock.settle()`. **Never call the real `settle()` while fake timers are installed.**
- **Equal-state conflation stays uncontracted:** no suite asserts a re-emission of an unchanged value. The folds return the SAME reference for a no-op transition precisely so that every core may drop it; suites read `values.at(-1)`.
- **No new env vars, scripts, packages or CI jobs.**
- Commit after every task with the repo's trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH
  ```

## Rulings recorded up front

1. **Three PRs: suites (A), run slot (R), ports (B).** A and B are the slice-2/3 shape. R is separate because a reviewer could approve the consolidation and reject a port, or the reverse; it is scheduled now because STATUS records it "due before or during slice 4" and `orderTicket` would otherwise be the scaffold's next copy in each core. A and R touch disjoint packages and run in parallel worktrees. Cost if wrong: one extra CI cycle.
2. **`createApp(ports, seams)` — the base app's internal consumers can be pointed at a sibling's native member.** `JarvisDriverMachine` is composed inside the RxJS `createApp` with a reference to the base `eqWorkspace`, and `AnimationDirector` with the base `ordersBlotter.fills$`. The moment a sibling owns `eqWorkspace` natively, the UI reads the native instance while a Jarvis drive batch (`eqSelect`, `eqTimeframe`, `eqIndicator`, `eqPane`) still mutates the base one — `tests/browser/scenarios/jarvis.ts` asserts the indicator appears, so the async and Effect e2e legs would go red. Slices 2–3 could record their equivalent (`executions$`, `rfqs.events$`) as an unobserved residual; this one is observed. So `@rtc/client-core`'s `createApp` takes an optional second argument, `CoreSeams { eqWorkspace?, equityFills$? }`: the base still BUILDS its own `eqWorkspace` and exposes it as `base.presenters.eqWorkspace` (so the parity drift test's reference-inequality stays meaningful), but `jarvisDriver`'s dep and `AnimationDirector`'s `equityFills$` read `seams.x ?? own`. `CoreFactory.createApp` is unchanged (`rxjsCore` stays assignable: an optional trailing parameter). Both siblings build their native presenters FIRST and pass the seams to the base. Strangler-phase scaffolding, deleted with delegation in slice 8. **Not in this slice:** the same seam would close slice 2's `AnimationDirector` residual (`executions$`, `pairs$`, `priceFor`, `rfqEvents$`) — deliberately left for its own PR so this one stays the equities slice. Cost if wrong: one optional parameter and two `??`.
3. **The state transitions move to pure folds in `@rtc/client-core`, and the RxJS machines are re-expressed over them** (`eqWorkspaceFold.ts`, `eqDrawingsFold.ts`, `orderTicketFold.ts`, `candleStitch.ts` — the `staleFlagFold.ts` / `tileExecutionState.ts` / `blotterFolds.ts` precedent). Event-union reducers (`reduceEqWorkspace(state, event)`), returning the same reference for a no-op. The RxJS machines' existing unit tests (`EqWorkspaceMachine.test.ts` 32 cases, `EqDrawingsMachine.test.ts` 13, `OrderTicketMachine.test.ts`, `CandleSeriesPresenter.test.ts` 19) are the regression witnesses and must pass UNCHANGED. Cost if wrong: a refactor that the existing tests would catch.
4. **One cadence moves to `@rtc/domain`:** `CANDLE_HISTORY_RETRY_COOLDOWN_MS = 1_000` (in `equities/timeframe.ts`, beside `CANDLE_HISTORY_PAGE`) — today `CandleSeriesPresenter`'s private `ERROR_RETRY_COOLDOWN_MS`. The suite drives the cooldown edge to the millisecond and may not import `client-core`. The RxJS file keeps its local name as an alias. Cost if wrong: a rename.
5. **The harness gains a seed: `makeHarness({ watchlist })`.** `eqWorkspace` reads the watchlist ONCE, synchronously, at composition (`peekFirstWatchlistSymbol`) — the simulator's `of(WATCHLIST)` path, which is the deployed default — and only falls back to the async `seed$` when that peek finds nothing (WS-real). A driver verb acts after construction, so it can only ever exercise the fallback. `MakeHarness` becomes `(seed?: HarnessSeed) => CoreHarness`; `scriptPorts(base, seed)` pre-loads the scripted watchlist (a `ReplaySubject(1)`, the state-of-the-world shape) so the composition-time peek finds it. The three runner files pass the seed through. Cost if wrong: one optional parameter.
6. **Singleton machines are warm from construction, and the contract says so through `getValue()`.** React's `useStateObservable(presenters.eqWorkspace.state$)` reads `getValue()` on the first render; a cold `StateObservable` hands back its construction-time default, however stale (`refToStateStream`'s doc already says so). The RxJS machines hold an internal subscription for exactly this reason. The siblings do the same through `storeToWarmStateStream` / `refToWarmStateStream` (bridge exports — the `.subscribe()` call stays in `bridge/`). The suites assert `state$.getValue()` after a zero-subscriber mutation. Per-mount machines (`orderTicket`) stay cold-capable, as slices 2–3 left theirs: `useMachine` subscribes at once. Cost if wrong: one stale first frame on the Equities tab under an alternative core.
7. **Retained vs refCounted follows the RxJS core exactly:** `watchlist$`, `orders$`, `positions$` are retained (`warmReplay`); `quote$(symbol)`, `depth$(symbol)`, `candles$(symbol, tf)` are per-key, memoised, refCounted, and MUST release their port on the last unsubscribe (`warmReplay`'s own doc: per-symbol streams are refcounted on the server). `fills$` is hot with no replay (the slice-2 `executions$` shape). Cost if wrong: one option per stream.
8. **The Effect core follows a keyed wire stream WITHOUT peeking it.** `mirrorPort` seeds a warm period by `peekCurrent(source)` — a subscribe + unsubscribe — and then subscribes again; on a keyed WS stream that is subscribe/unsubscribe/subscribe on the wire at the start of every warm period. `quote$`, `depth$` use a new `followPort(host, source)` (in `presenters/mirrorPort.ts`): a seedless `sharedFold` whose producer is one `fromPort`. The first value then arrives a fiber hop after subscribe rather than in the caller's tick; the bindings bind both with a `null` default and the suites assert them after `settle()`. Recorded asymmetry, the `mirrorPort`-with-`None`-seed one. Cost if wrong: one helper.
9. **`orders()` is treated as the one-shot query its own doc says it is.** The RxJS core re-subscribes `orderPort.orders()` inside a `switchMap` on every lifecycle update; the siblings take its FIRST value per refresh (`once` / `rpc`), newest refresh wins. Identical for every shipping adapter (simulator: `defer → of → complete`; WS: request/response). `orders$`'s first value is NOT contracted as synchronous — it is an RPC on WS-real and the bindings bind it with `[]`. Cost if wrong: a multi-emission `orders()` would show only its first value per refresh in the siblings.
10. **`place()` is a per-call, multi-value, lazy stream, and it gets one new bridge export per core.** `promiseToStream` / `rpc` are single-value; a `Topic` would share one port call between two subscribers of the same result. Async: `portCallToStream(open, onValue)` in `bridge/out.ts` (an `Observable` over `relay`, the twin of `promiseToStream`). Effect: `scopedPortStream(open)` in `bridge/out.ts` (`Stream.unwrapScoped` over `fromObservable(open(), scope)` — the port is called when the stream starts, released when its scope closes). Completion of `place()` is uncontracted (spec, slice 1b). Cost if wrong: two small exports.
11. **`candleSeries` keeps the RxJS semantics to the letter, including the two knowing oddities:** a fresh warm period RESETS the key's backfill (`older`, `exhausted`, the anchor) because the base series regenerates from a new "now"; and an in-flight history fetch is NOT cancelled by the period ending (it clears its own flags; in the siblings it is bound to the app lifetime rather than to nothing). `candles$("")` is an empty series that never touches the port. The cooldown reads an injectable `now` (default `Date.now`, which vitest fakes). Cost if wrong: none observable beyond the suite.
12. **`orderTicket`'s in-flight gate is the imported reducer, not a re-derivation.** The RxJS machine suppresses form edits while an order is working by a `scan` over candidate states; `reduceOrderTicket(acc, candidate)` IS that scan step. Each sibling keeps the form as plain mutable state, offers candidates through the reducer, and writes `acc.state`. A valid `submit()` supersedes the run in flight; an INVALID `submit()` also ends it (the RxJS `switchMap` switches to the error state) — both contracted. **A failing `place()` is uncontracted:** RxJS errors `state$`; the siblings rethrow out of band (slice 2 ruling 8) and stay `submitting`. Mapping it to `rejected` is a product fix for all three cores, not a port concern — recorded as a residual. Cost if wrong: none.
13. **The two singletons are app-lifetime, not detached.** Async: `createEqWorkspaceMachine(deps, lifetime)` — `lifetime` aborts its watchlist relay and releases the keep-warm. Effect: `createChildHost(parent)` (new `bridge/out.ts` export) — the DEFAULT runtime as the runner (so an intent arriving after `app.dispose()` cannot die on a disposed runtime) and a scope forked from the app host's (so `app.dispose()` ends the machine). `dispose()` on either is idempotent. Cost if wrong: a leaked relay per app.
14. **The seed is one watchlist relay guarded by a flag, not an abort from inside the callback.** `relay` registers its abort listener after `subscribe` returns, so aborting during a SYNCHRONOUS first emission would strand the subscription. The async machine keeps the relay for its lifetime and ignores every list after the first non-empty one; the Effect machine uses `Stream.take(1)`, which releases through `fromObservable`'s `ensuring`. The reducer's own guard (`seed` applies only while `sel === ""`) makes a user selection win in every core. Cost if wrong: none.
15. **`createRunSlot` owns the guard, not just the bookkeeping.** Async: `Run<S> { signal, set(next), ifCurrent(step) }` — `set` and `ifCurrent` are dropped once `signal.aborted`, which closes the one-microtask stale-write window (an awaited resolution landing in the same tick as a supersede) for every machine at once, and keeps R11's dispose-inside-`onRedirect` convergence. Effect: `Run<S> { write(next), guarded(step) }` — the run token R10 keeps. `dispose()` on the Effect slot also closes the host scope. Behaviour-preserving for the four machines: their unit tests and the 127-case contract runners pass unchanged. Cost if wrong: the existing tests are the witness.
16. **The Effect Layer graph grows by seven: six independents and one dependent.** `WatchlistLive`, `CandleSeriesLive`, `DepthLive`, `OrdersBlotterLive`, `PositionsLive`, `EqDrawingsLive` join `independent`; `EqWorkspaceLive` requires `WatchlistTag` and joins `dependent`, with `WatchlistLive` both merged into the app and provided to it (memoised by reference — built ONCE, as `PowerSaverLive` is). `layers.test.ts` goes 26 → 33 and pins that `marketData.watchlist` was called exactly once by the native graph. Cost if wrong: mechanical.
17. **PR A changes production behaviour nowhere.** The folds are a re-expression under the same tests; `createApp`'s new parameter is unused by every caller until PR B. PR R is behaviour-preserving by its tests. PR B is production-inert while `VITE_CORE_IMPL` stays unset.

## Parallelism (accelerated SDD)

- **Wave 1 (two worktrees, three implementers).** Worktree `slice-4-a`: Task 1 (`domain`, `client-core`) and Task 2 (`core-contract` harness) touch disjoint packages and run as two parallel implementers, each committing by pathspec (`-- packages/domain packages/client-core` / `-- packages/core-contract`). Worktree `slice-4-r`: Task 4 (`client-core-async`) and Task 5 (`client-core-effect`) likewise (`-- packages/client-core-async` / `-- packages/client-core-effect`). The controller runs `pnpm build` ONCE in each worktree before dispatching; implementers run `vitest` only. Exception: Task 1's fold files are consumed by nobody else in the wave, and Task 2's harness imports only `@rtc/domain` types that exist today, so neither needs the other's output.
- **Task 3** (suites + registry + runners) follows Tasks 1–2, alone, after a controller rebuild. Ship PR A. Ship PR R when Tasks 4–5 are reviewed (its own gauntlet).
- **Wave 2 (one fresh worktree off the `main` containing A and R):** Task 6 (async) and Task 7 (Effect) in parallel by pathspec, controller-prebuilt, no implementer builds. Task 8 last, alone.
- Covering tests only per implementer; one gauntlet per PR; a mid review per task and a final whole-branch review per PR on the most capable model (they found a real gap in every slice so far — never cut them). Subagents are briefed foreground-only, `git -C "$WORKTREE"`, absolute paths, no subagents of their own.

---

## File structure

```
PR A ───────────────────────────────────────────────────────────────────────────
packages/domain/                                    MODIFIED (Task 1)
  src/equities/timeframe.ts                         + CANDLE_HISTORY_RETRY_COOLDOWN_MS
  src/index.ts                                      export it
packages/client-core/                               MODIFIED (Task 1)
  src/presenters/eqWorkspaceFold.ts                 NEW  EqWorkspaceEvent, createEqWorkspaceState, reduceEqWorkspace, firstWatchlistSymbol
  src/presenters/eqDrawingsFold.ts                  NEW  EqDrawingsEvent, INITIAL_EQ_DRAWINGS_STATE, reduceEqDrawings
  src/presenters/orderTicketFold.ts                 NEW  OrderTicketAcc, createOrderTicketForm/Acc, reduceOrderTicket, validateOrderTicket, orderToTicketPhase, toPlaceOrderRequest
  src/presenters/candleStitch.ts                    NEW  stitchCandles
  src/presenters/__tests__/{eqWorkspaceFold,eqDrawingsFold,orderTicketFold,candleStitch}.test.ts   NEW
  src/presenters/{EqWorkspaceMachine,EqDrawingsMachine,OrderTicketMachine,CandleSeriesPresenter}.ts  re-expressed over the folds
  src/presenters/index.ts                           export the four fold modules
  src/composition.ts                                + CoreSeams; createApp(ports, seams = {})
  src/index.ts                                      export type CoreSeams
  src/__tests__/composition.seams.test.ts           NEW
packages/core-contract/                             MODIFIED (Task 2)
  src/harness/pendingQueue.ts                       + emit, complete
  src/harness/scriptedPorts.ts                      scripted marketData/orders/positions; HarnessSeed; driver verbs; PortMethodName + 2
  src/harness/harness.ts                            MakeHarness takes an optional HarnessSeed
  src/harness/fixtures.ts                           + AAPL, MSFT, TSLA, createEquityQuote, createCandle, createCandles, createDepthBook, createEquityOrder, createEquityPosition
  src/harness/{pendingQueue,scriptedPorts}.test.ts  + cases
  src/index.ts                                      export the fixtures + HarnessSeed/CandleHistoryRequest types
packages/core-contract/                             MODIFIED (Task 3)
  src/suites/{watchlist,candleSeries,depth,ordersBlotter,positions}.ts   NEW
  src/suites/{eqWorkspace,eqDrawings,orderTicket}.ts                    NEW
  src/suites/portDiscipline.ts                      + marketData.watchlist, positions.positions
  src/registry.ts                                   eight → suites; PENDING_SUITES 38 → 30
  src/registry.test.ts                              + "slice 4 members have suites"
packages/client-core/src/composition.coreContract.test.ts        runner passes the seed (Task 3)
packages/client-core-async/src/coreContract.test.ts              runner passes the seed (Task 3)
packages/client-core-effect/src/coreContract.test.ts             runner passes the seed (Task 3)
PR R ───────────────────────────────────────────────────────────────────────────
packages/client-core-async/                         MODIFIED (Task 4)
  src/kernel/runSlot.ts (+ .test.ts)                NEW  createRunSlot, Run, RunSlot
  src/machines/{tileExecution,rfqTile,rfqSubmission,ticketSubmission}.ts   onto the slot
  src/index.ts                                      export createRunSlot
packages/client-core-effect/                        MODIFIED (Task 5)
  src/machines/runSlot.ts (+ .test.ts)              NEW  createRunSlot, Run, RunSlot
  src/machines/{tileExecution,rfqTile,rfqSubmission,ticketSubmission}.ts   onto the slot
  src/index.ts                                      export createRunSlot
PR B ───────────────────────────────────────────────────────────────────────────
packages/client-core-async/                         MODIFIED (Task 6)
  src/bridge/out.ts                                 + portCallToStream, storeToWarmStateStream
  src/presenters/keyedPortStreams.ts                NEW  createKeyedPortStreams
  src/presenters/{watchlist,candleSeries,depth,ordersBlotter}.ts   NEW
  src/presenters/warmSingletons.ts                  + createPositionsPresenter
  src/machines/{eqWorkspace,eqDrawings,orderTicket}.ts             NEW
  src/composition.ts                                native first, seams to the base; +7 presenters, +1 machine
  src/composition.machineFactories.test.ts          + orderTicket wiring; src/composition.seams.test.ts NEW
  src/parity.json / src/index.ts / README.md
  tests beside every new file
packages/client-core-effect/                        MODIFIED (Task 7)
  src/bridge/out.ts                                 + scopedPortStream, createChildHost, refToWarmStateStream
  src/presenters/mirrorPort.ts                      + followPort
  src/presenters/{watchlist,candleSeries,depth,ordersBlotter}.ts   NEW
  src/presenters/warmSingletons.ts                  + createPositionsPresenter
  src/machines/{eqWorkspace,eqDrawings,orderTicket}.ts             NEW
  src/layers.ts                                     + seven tags and layers (EqWorkspaceLive dependent on WatchlistTag)
  src/composition.ts                                runtime first, seams to the base; +1 machine
  src/layers.test.ts                                26 → 33
  src/composition.machineFactories.test.ts          + orderTicket wiring; src/composition.seams.test.ts NEW
  src/parity.json / src/index.ts / README.md
  tests beside every new file
docs (Task 8): ADR-006 "Decided in slice 4"; §22; spec receipt; CLAUDE.md; STATUS.md → slice 5; both READMEs; the rulings ledger
```

---

## PR A — the RxJS side

### Task 1: Pure folds, the cooldown constant, and the core seam (domain, client-core)

**Files:**
- Modify: `packages/domain/src/equities/timeframe.ts`, `packages/domain/src/index.ts`
- Create: `packages/client-core/src/presenters/eqWorkspaceFold.ts`, `eqDrawingsFold.ts`, `orderTicketFold.ts`, `candleStitch.ts` and a test for each under `packages/client-core/src/presenters/__tests__/`
- Modify: `packages/client-core/src/presenters/EqWorkspaceMachine.ts`, `EqDrawingsMachine.ts`, `OrderTicketMachine.ts`, `CandleSeriesPresenter.ts`, `packages/client-core/src/presenters/index.ts`, `packages/client-core/src/composition.ts`, `packages/client-core/src/index.ts`
- Create: `packages/client-core/src/__tests__/composition.seams.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (Tasks 6–7 import every one of these from `@rtc/client-core`; Task 3 imports the constant from `@rtc/domain`):
  - `CANDLE_HISTORY_RETRY_COOLDOWN_MS: number` (`@rtc/domain`)
  - `type EqWorkspaceEvent`, `createEqWorkspaceState(initialSymbol: string): EqWorkspaceState`, `reduceEqWorkspace(state: EqWorkspaceState, event: EqWorkspaceEvent): EqWorkspaceState`, `firstWatchlistSymbol(list: readonly EquityInstrument[]): string`
  - `type EqDrawingsEvent`, `INITIAL_EQ_DRAWINGS_STATE: EqDrawingsState`, `reduceEqDrawings(state: EqDrawingsState, event: EqDrawingsEvent): EqDrawingsState`
  - `interface OrderTicketAcc { readonly inFlight: boolean; readonly state: OrderTicketState }`, `createOrderTicketForm(defaultSymbol: string): OrderTicketForm`, `createOrderTicketAcc(form: OrderTicketForm): OrderTicketAcc`, `reduceOrderTicket(acc: OrderTicketAcc, next: OrderTicketState): OrderTicketAcc`, `validateOrderTicket(form: OrderTicketForm): string | null`, `orderToTicketPhase(order: EquityOrder): OrderTicketState`, `toPlaceOrderRequest(form: OrderTicketForm): PlaceOrderRequest`
  - `stitchCandles(older: readonly Candle[], base: readonly Candle[]): readonly Candle[]`
  - `interface CoreSeams { readonly eqWorkspace?: Machine<EqWorkspaceState, EqWorkspaceIntents>; readonly equityFills$?: Stream<EquityFillSignal> }`, `createApp(ports: AppPorts, seams?: CoreSeams): App`

- [ ] **Step 1: The cooldown constant.** In `packages/domain/src/equities/timeframe.ts`, after `CANDLE_HISTORY_PAGE`:

```ts
/** How long a failed backfill page blocks the next attempt. The near-edge
 * trigger is an effect that can re-fire at render cadence while the viewport
 * sits at the wall, so an unthrottled retry would hammer the port every
 * frame. Every application core honours it; the contract suite drives the
 * edge to the millisecond. */
export const CANDLE_HISTORY_RETRY_COOLDOWN_MS = 1_000;
```

Add it to the existing `./equities/timeframe.js` export block in `packages/domain/src/index.ts` (alphabetical, where Biome puts it).

- [ ] **Step 2: Write the failing fold tests.** Four files under `packages/client-core/src/presenters/__tests__/`. Each imports from `#/presenters/<fold>` and is RED until Step 3 ("Cannot find module").

`eqWorkspaceFold.test.ts` — cases (each a plain `reduceEqWorkspace` call, no streams):
  - `createEqWorkspaceState("AAPL")` is `{ sel: "AAPL", openTabs: ["AAPL"], timeframe: "1D", chartType: "candles", indicators: [], panes: [], yScale: "linear", compare: null }`; `createEqWorkspaceState("")` has `openTabs: []` (no phantom tab).
  - `select` appends an unopened symbol and selects it; re-selecting an open one does not duplicate the tab; selecting the compared symbol clears `compare`.
  - `closeTab`: an unknown symbol and the sole remaining tab each return the SAME reference (`toBe`); closing a non-selected tab keeps `sel`; closing the selected middle tab selects the tab that slides into its slot; closing the selected last tab selects the new last.
  - `setTimeframe`, `setChartType`; `toggleIndicator` and `togglePane` add then remove and are independent sets; `toggleYScale` flips linear ↔ log.
  - `setCompare("MSFT")` sets it; `setCompare(sel)` returns the same reference; `setCompare(null)` clears; `yScale` is never touched by compare.
  - `seed` applies only while `sel === ""` (sets `sel` and `openTabs: [sym]`); on a populated state it returns the same reference.
  - `firstWatchlistSymbol([])` is `""`; of a two-item list it is the first symbol.

`eqDrawingsFold.test.ts` — `INITIAL_EQ_DRAWINGS_STATE` is `{ tool: "cursor", drawings: {}, selectedId: null }`; `setTool` drops the selection; `addDrawing` appends, selects the new id and reverts to `cursor`; `updateDrawing` replaces in place (z-order stable) and returns the same reference for an unknown id; `selectDrawing`; `deleteSelected` is the same reference when nothing is selected or the id is not in that symbol's list, otherwise removes and clears; `shiftAnchors` moves BOTH anchors of every trendline for that symbol, leaves hlines and other symbols alone, and returns the same reference for a symbol with no list.

`orderTicketFold.test.ts` — `createOrderTicketForm("AAPL")` is `{ symbol: "AAPL", side: "buy", type: "market", qty: 0 }`; `validateOrderTicket`: qty ≤ 0 → `"Quantity must be greater than zero"`, a limit order with no or non-positive price → `"Limit price required for a limit order"`, a valid market and a valid limit → `null`; `orderToTicketPhase` maps `working`/`partiallyFilled`/`filled` to the phase carrying the order, `rejected` to `{ phase: "rejected", reason: "Order rejected" }`, and `new`/`cancelled` to `{ phase: "submitting" }`; `toPlaceOrderRequest` copies the five fields; `reduceOrderTicket`: `submitting` sets `inFlight`; `filled`, `rejected` and an `editing` WITH an error clear it; an `editing` with `error: null` while `inFlight` returns the same `acc` (suppressed); any other state passes through keeping `inFlight`.

`candleStitch.test.ts` — empty `older` returns the base deduped by time; older candles at or after `base[0].time` are dropped; a duplicate time keeps its FIRST position with the LAST value; an empty base returns `[]` whatever `older` holds.

Run: `pnpm --filter @rtc/client-core exec vitest run src/presenters/__tests__/eqWorkspaceFold.test.ts src/presenters/__tests__/eqDrawingsFold.test.ts src/presenters/__tests__/orderTicketFold.test.ts src/presenters/__tests__/candleStitch.test.ts` — Expected: FAIL (modules not found).

- [ ] **Step 3: Write the four folds.**

`packages/client-core/src/presenters/eqWorkspaceFold.ts`:

```ts
import type {
  EqChartType,
  EqIndicatorId,
  EqPaneId,
  EqWorkspaceState,
} from "@rtc/core-api";
import type { CandleTimeframe, EquityInstrument } from "@rtc/domain";

/** One input of the equities-workspace fold: the eight intents, plus the
 * one-shot `seed` a late-arriving watchlist supplies. */
export type EqWorkspaceEvent =
  | { readonly kind: "select"; readonly sym: string }
  | { readonly kind: "closeTab"; readonly sym: string }
  | { readonly kind: "setTimeframe"; readonly timeframe: CandleTimeframe }
  | { readonly kind: "setChartType"; readonly chartType: EqChartType }
  | { readonly kind: "toggleIndicator"; readonly id: EqIndicatorId }
  | { readonly kind: "togglePane"; readonly id: EqPaneId }
  | { readonly kind: "toggleYScale" }
  | { readonly kind: "setCompare"; readonly sym: string | null }
  | { readonly kind: "seed"; readonly sym: string };

/** The workspace a session opens with. An empty `initialSymbol` means no
 * tab is open yet (WS-real: the watchlist has not arrived synchronously) —
 * NOT a phantom "" tab. */
export function createEqWorkspaceState(
  initialSymbol: string,
): EqWorkspaceState {
  return {
    sel: initialSymbol,
    openTabs: initialSymbol === "" ? [] : [initialSymbol],
    timeframe: "1D",
    chartType: "candles",
    indicators: [],
    panes: [],
    yScale: "linear",
    compare: null,
  };
}

/** The first symbol of a watchlist, or "" when there is none — what the
 * workspace seeds its selection from, synchronously at composition and,
 * failing that, from the first non-empty list to arrive. */
export function firstWatchlistSymbol(
  list: readonly EquityInstrument[],
): string {
  return list[0]?.symbol ?? "";
}

/** The equities-workspace state transition, shared by every application
 * core. A transition that changes nothing returns the SAME reference, so a
 * core whose cell drops an `Object.is`-equal write stays silent through it. */
export function reduceEqWorkspace(
  state: EqWorkspaceState,
  event: EqWorkspaceEvent,
): EqWorkspaceState {
  switch (event.kind) {
    case "select":
      return selectSymbol(state, event.sym);
    case "closeTab":
      return closeTab(state, event.sym);
    case "setTimeframe":
      return { ...state, timeframe: event.timeframe };
    case "setChartType":
      return { ...state, chartType: event.chartType };
    case "toggleIndicator":
      return { ...state, indicators: toggled(state.indicators, event.id) };
    case "togglePane":
      return { ...state, panes: toggled(state.panes, event.id) };
    case "toggleYScale":
      return { ...state, yScale: state.yScale === "log" ? "linear" : "log" };
    case "setCompare":
      // Comparing the selected symbol against itself is a no-op, not a clear.
      return event.sym !== null && event.sym === state.sel
        ? state
        : { ...state, compare: event.sym };
    case "seed":
      // Only while nothing is selected: a synchronous initial symbol or an
      // intervening user select() always wins over a late-arriving seed.
      return state.sel !== ""
        ? state
        : { ...state, sel: event.sym, openTabs: [event.sym] };
  }
}

/** Adds the symbol to the open tabs if it is not there, then (re)selects
 * it. Selecting the compared symbol clears the comparison — the primary
 * absorbs it. */
function selectSymbol(state: EqWorkspaceState, sym: string): EqWorkspaceState {
  const openTabs = state.openTabs.includes(sym)
    ? state.openTabs
    : [...state.openTabs, sym];
  const compare = state.compare === sym ? null : state.compare;
  return { ...state, sel: sym, openTabs, compare };
}

/** Never empties the tab strip: closing the sole remaining tab, or a symbol
 * that is not open, is a no-op. Closing the SELECTED tab falls back to the
 * tab that slides into its slot, or the new last tab. */
function closeTab(state: EqWorkspaceState, sym: string): EqWorkspaceState {
  const idx = state.openTabs.indexOf(sym);

  if (idx === -1 || state.openTabs.length === 1) {
    return state;
  }

  const openTabs = [
    ...state.openTabs.slice(0, idx),
    ...state.openTabs.slice(idx + 1),
  ];

  if (state.sel !== sym) {
    return { ...state, openTabs };
  }

  const neighbourIdx = Math.min(idx, openTabs.length - 1);
  return { ...state, sel: openTabs[neighbourIdx], openTabs };
}

function toggled<T>(set: readonly T[], id: T): readonly T[] {
  return set.includes(id)
    ? set.filter((existing) => {
        return existing !== id;
      })
    : [...set, id];
}
```

`packages/client-core/src/presenters/eqDrawingsFold.ts`:

```ts
import type { EqDrawing, EqDrawingsState, EqDrawTool } from "@rtc/core-api";

export type EqDrawingsEvent =
  | { readonly kind: "setTool"; readonly tool: EqDrawTool }
  | {
      readonly kind: "addDrawing";
      readonly sym: string;
      readonly drawing: EqDrawing;
    }
  | {
      readonly kind: "updateDrawing";
      readonly sym: string;
      readonly drawing: EqDrawing;
    }
  | { readonly kind: "selectDrawing"; readonly id: string | null }
  | { readonly kind: "deleteSelected"; readonly sym: string }
  | { readonly kind: "shiftAnchors"; readonly sym: string; readonly by: number };

export const INITIAL_EQ_DRAWINGS_STATE: EqDrawingsState = {
  tool: "cursor",
  drawings: {},
  selectedId: null,
};

/** The chart-annotation state transition, shared by every application core.
 * A transition that changes nothing returns the SAME reference. */
export function reduceEqDrawings(
  state: EqDrawingsState,
  event: EqDrawingsEvent,
): EqDrawingsState {
  switch (event.kind) {
    case "setTool":
      // Switching tool always drops the selection.
      return { ...state, tool: event.tool, selectedId: null };
    case "addDrawing":
      return addDrawing(state, event.sym, event.drawing);
    case "updateDrawing":
      return updateDrawing(state, event.sym, event.drawing);
    case "selectDrawing":
      return { ...state, selectedId: event.id };
    case "deleteSelected":
      return deleteSelected(state, event.sym);
    case "shiftAnchors":
      return shiftAnchors(state, event.sym, event.by);
  }
}

/** Append + auto-select + revert to cursor (draw one, then you are
 * manipulating — TradingView's default). */
function addDrawing(
  state: EqDrawingsState,
  sym: string,
  drawing: EqDrawing,
): EqDrawingsState {
  const list = state.drawings[sym] ?? [];
  return {
    ...state,
    drawings: { ...state.drawings, [sym]: [...list, drawing] },
    selectedId: drawing.id,
    tool: "cursor",
  };
}

/** Replaces the matching id in place (z-order stable); a no-op when the id
 * is not present. Selection and tool are untouched. */
function updateDrawing(
  state: EqDrawingsState,
  sym: string,
  drawing: EqDrawing,
): EqDrawingsState {
  const list = state.drawings[sym] ?? [];
  const at = list.findIndex((d) => {
    return d.id === drawing.id;
  });

  if (at === -1) {
    return state;
  }

  const next = [...list];
  next[at] = drawing;
  return { ...state, drawings: { ...state.drawings, [sym]: next } };
}

function deleteSelected(state: EqDrawingsState, sym: string): EqDrawingsState {
  if (state.selectedId === null) {
    return state;
  }

  const list = state.drawings[sym] ?? [];
  const filtered = list.filter((d) => {
    return d.id !== state.selectedId;
  });

  if (filtered.length === list.length) {
    return state;
  }

  return {
    ...state,
    drawings: { ...state.drawings, [sym]: filtered },
    selectedId: null,
  };
}

/** Adds `by` to every anchor index of the symbol's trendlines; hlines have
 * no index and other symbols are untouched. */
function shiftAnchors(
  state: EqDrawingsState,
  sym: string,
  by: number,
): EqDrawingsState {
  const list = state.drawings[sym];

  if (list === undefined) {
    return state;
  }

  const shifted = list.map((d) => {
    if (d.kind !== "trendline") {
      return d;
    }

    return {
      ...d,
      a: { ...d.a, index: d.a.index + by },
      b: { ...d.b, index: d.b.index + by },
    };
  });

  return { ...state, drawings: { ...state.drawings, [sym]: shifted } };
}
```

`packages/client-core/src/presenters/orderTicketFold.ts`:

```ts
import type { OrderTicketForm, OrderTicketState } from "@rtc/core-api";
import type { EquityOrder, PlaceOrderRequest } from "@rtc/domain";

/** The ticket fold's accumulator: the state consumers see, and whether a
 * valid order is in flight — which gates stray form edits off. */
export interface OrderTicketAcc {
  readonly inFlight: boolean;
  readonly state: OrderTicketState;
}

export function createOrderTicketForm(defaultSymbol: string): OrderTicketForm {
  return { symbol: defaultSymbol, side: "buy", type: "market", qty: 0 };
}

export function createOrderTicketAcc(form: OrderTicketForm): OrderTicketAcc {
  return { inFlight: false, state: { phase: "editing", form, error: null } };
}

export function validateOrderTicket(form: OrderTicketForm): string | null {
  if (form.qty <= 0) {
    return "Quantity must be greater than zero";
  }

  if (
    form.type === "limit" &&
    (form.limitPrice === undefined || form.limitPrice <= 0)
  ) {
    return "Limit price required for a limit order";
  }

  return null;
}

export function orderToTicketPhase(order: EquityOrder): OrderTicketState {
  switch (order.status) {
    case "working":
      return { phase: "working", order };
    case "partiallyFilled":
      return { phase: "partiallyFilled", order };
    case "filled":
      return { phase: "filled", order };
    case "rejected":
      return { phase: "rejected", reason: "Order rejected" };
    default:
      return { phase: "submitting" };
  }
}

export function toPlaceOrderRequest(form: OrderTicketForm): PlaceOrderRequest {
  return {
    symbol: form.symbol,
    side: form.side,
    type: form.type,
    qty: form.qty,
    limitPrice: form.limitPrice,
  };
}

/** One step of the ticket fold over CANDIDATE states — an `editing` from a
 * form edit, an `editing` with an error from a failed validation, or a
 * lifecycle phase from `place()`. A valid submit (`submitting`) sets
 * `inFlight`; a terminal phase or a validation error clears it; while in
 * flight a plain form edit is suppressed (the SAME `acc` comes back), so it
 * cannot clobber submitting/working/…. */
export function reduceOrderTicket(
  acc: OrderTicketAcc,
  next: OrderTicketState,
): OrderTicketAcc {
  if (next.phase === "submitting") {
    return { inFlight: true, state: next };
  }

  if (next.phase === "filled" || next.phase === "rejected") {
    return { inFlight: false, state: next };
  }

  if (next.phase === "editing" && next.error !== null) {
    return { inFlight: false, state: next };
  }

  if (acc.inFlight && next.phase === "editing" && next.error === null) {
    return acc;
  }

  return { inFlight: acc.inFlight, state: next };
}
```

`packages/client-core/src/presenters/candleStitch.ts`:

```ts
import type { Candle } from "@rtc/domain";

/** The backfilled pages stitched AHEAD of the live base series. Only
 * candles strictly older than the base's first survive (the contiguity
 * guard), and the result holds at most one entry per `time` — so a page
 * landing twice, or an overlap surviving the guard, can never render twice.
 * An empty base is an empty series: there is nothing to be older than. */
export function stitchCandles(
  older: readonly Candle[],
  base: readonly Candle[],
): readonly Candle[] {
  const first = base[0];

  if (older.length === 0 || first === undefined) {
    return dedupeByTime(base);
  }

  const contiguous = older.filter((candle) => {
    return candle.time < first.time;
  });
  return dedupeByTime([...contiguous, ...base]);
}

/** At most one entry per `time`, keeping the FIRST-seen position (a `Map`'s
 * `.set` on an existing key updates the value without moving it). */
function dedupeByTime(candles: readonly Candle[]): readonly Candle[] {
  const byTime = new Map<number, Candle>();

  for (const candle of candles) {
    byTime.set(candle.time, candle);
  }

  return [...byTime.values()];
}
```

Note the one deliberate difference from the inline RxJS code: with an empty base and a non-empty `older`, the RxJS `map` returned `dedupeByTime(base)` = `[]` too (`!first` short-circuits) — identical.

Export all four from `packages/client-core/src/presenters/index.ts` as `export * from "#/presenters/eqWorkspaceFold";` etc., beside `staleFlagFold`.

Run the four fold tests — Expected: PASS.

- [ ] **Step 4: Re-express the RxJS machines over the folds.** Behaviour must not move: the existing `EqWorkspaceMachine.test.ts`, `EqDrawingsMachine.test.ts`, `OrderTicketMachine.test.ts`, `CandleSeriesPresenter.test.ts` and `composition.eqWorkspace.test.ts` pass UNCHANGED.

`EqWorkspaceMachine.ts` — keep the doc comments, `EqWorkspaceDeps` and the re-exported types; replace the eight `Subject`s, the nine patch streams and `initial` with:

```ts
  const event$ = new Subject<EqWorkspaceEvent>();
  const initial = createEqWorkspaceState(deps.initialSymbol);

  // Recovery: exactly one emission from seed$ (or none, when it is omitted).
  // The fold applies it only while `sel` is still "" — the ONLY path that
  // turns an empty workspace into a seeded one when the watchlist arrives
  // asynchronously (WS-real).
  const seedEvent$ = (deps.seed$ ?? EMPTY).pipe(
    take(1),
    map((sym): EqWorkspaceEvent => {
      return { kind: "seed", sym };
    }),
  );

  const stream$ = merge(event$, seedEvent$).pipe(
    scan(reduceEqWorkspace, initial),
  );
```

and each intent as `event$.next({ kind: "select", sym })` (… `closeTab`, `setTimeframe` with `timeframe: tf`, `setChartType` with `chartType: kind`, `toggleIndicator`, `togglePane`, `toggleYScale`, `setCompare`); `dispose` is `event$.complete(); warm.unsubscribe();`. Import the fold from `./eqWorkspaceFold.js` (this file's existing relative-import style).

`EqDrawingsMachine.ts` — the same move: one `Subject<EqDrawingsEvent>`, `scan(reduceEqDrawings, INITIAL_EQ_DRAWINGS_STATE)`, `state(stream$, INITIAL_EQ_DRAWINGS_STATE)`.

`OrderTicketMachine.ts` — delete the local `validate`, `orderToPhase`, `InFlightAcc` and the inline scan reducer; `initialForm = createOrderTicketForm(deps.defaultSymbol)`; the request is `toPlaceOrderRequest(currentForm)`; the final pipe is `scan(reduceOrderTicket, createOrderTicketAcc(initialForm))` then `map((acc) => acc.state)` (block-bodied). Everything else — `form$`, `currentForm`, the `switchMap` — stays.

`CandleSeriesPresenter.ts` — `const ERROR_RETRY_COOLDOWN_MS = CANDLE_HISTORY_RETRY_COOLDOWN_MS;` (import from `@rtc/domain`); the `combineLatest` `map` body becomes `return stitchCandles(older, base);`; delete the private `dedupeByTime`.

Run: `pnpm --filter @rtc/client-core exec vitest run src/presenters src/__tests__/composition.eqWorkspace.test.ts` — Expected: PASS, no test file edited.

- [ ] **Step 5: Write the failing seam test.** `packages/client-core/src/__tests__/composition.seams.test.ts`, modelled on `composition.jarvis.test.ts`'s "a command batch through createApp…" case (same ports construction, a `JarvisPort` whose `ask()` replies with one `command` event):

```ts
import { firstValueFrom, type Observable, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EquityFillSignal } from "@rtc/core-api";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";
import type { JarvisEvent } from "@rtc/shared";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { JarvisPort } from "#/adapters/jarvisPort";
import { type AppPorts, createSimulatorPorts } from "#/adapters/portFactory";
import { createApp } from "#/composition";
import type { AnimationIntent } from "#/presenters/AnimationDirector";
import { createEqWorkspaceMachine } from "#/presenters/index";

describe("createApp — core seams (strangler phase)", () => {
  it("a supplied eqWorkspace is the one a Jarvis drive batch mutates; the app's own stays where it was", async () => {
    const seam = createEqWorkspaceMachine({ initialSymbol: "AAPL" });
    const { presenters } = createApp(
      createPorts({ jarvis: createSelectingJarvisPort("MSFT") }),
      { eqWorkspace: seam },
    );
    const before = await firstValueFrom(presenters.eqWorkspace.state$);

    presenters.jarvis.intents.send("select MSFT");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect((await firstValueFrom(seam.state$)).sel).toBe("MSFT");
    expect((await firstValueFrom(presenters.eqWorkspace.state$)).sel).toBe(
      before.sel,
    );
    presenters.jarvis.dispose();
    seam.dispose();
  });

  it("with no seam the drive batch mutates the app's own eqWorkspace, as before", async () => {
    const { presenters } = createApp(
      createPorts({ jarvis: createSelectingJarvisPort("MSFT") }),
    );

    presenters.jarvis.intents.send("select MSFT");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect((await firstValueFrom(presenters.eqWorkspace.state$)).sel).toBe(
      "MSFT",
    );
    presenters.jarvis.dispose();
  });

  it("a supplied equityFills$ drives the ticket fill intent", () => {
    const fills$ = new Subject<EquityFillSignal>();
    const { presenters } = createApp(createPorts({}), { equityFills$: fills$ });
    const intents: AnimationIntent[] = [];
    const sub = presenters.animationDirector
      .intentsFor("ticket:AAPL")
      .subscribe((intent) => {
        intents.push(intent);
      });

    fills$.next({ symbol: "AAPL" });

    expect(intents).toEqual([{ target: "ticket:AAPL", kind: "fill" }]);
    sub.unsubscribe();
  });
});

function createPorts(overrides: Partial<AppPorts>): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: new ConnectionEventsSimulator(),
    ...overrides,
  };
}

/** A JarvisPort whose ask() replies with one drive batch selecting `symbol`
 * in the equities workspace. */
function createSelectingJarvisPort(symbol: string): JarvisPort {
  return {
    ask: (): Observable<JarvisEvent> => {
      return of<JarvisEvent>({
        type: "command",
        batch: { v: 1, commands: [{ kind: "eqSelect", symbol }] },
      });
    },
    confirm: (): void => {
      // unused by these tests
    },
  };
}
```

`MSFT` must be a simulator watchlist symbol (`knownSymbols$` validates it) — check `EquityMarketDataSimulator`'s catalogue and pick another real one if it is not. If `AnimationIntent` is exported from a different module, import it from where `AnimationDirector.ts` declares it. Run it — Expected: FAIL (`createApp` takes one argument; the seam is ignored).

- [ ] **Step 6: Add the seam.** In `packages/client-core/src/composition.ts`, above `createApp`:

```ts
/** Members an alternative core owns NATIVELY while this app's internal
 * consumers still need to reach them — strangler-phase scaffolding, deleted
 * with delegation in slice 8. The base app still builds and exposes its OWN
 * instance of each (so the siblings' parity drift test can tell native from
 * delegated by reference); a seam only redirects what `JarvisDriverMachine`
 * and `AnimationDirector` read. Without it, a Jarvis drive batch would
 * mutate a workspace the UI no longer renders. */
export interface CoreSeams {
  readonly eqWorkspace?: Machine<EqWorkspaceState, EqWorkspaceIntents>;
  readonly equityFills$?: Observable<EquityFillSignal>;
}
```

`createApp(ports: AppPorts, seams: CoreSeams = {}): App`; the `jarvisDriver` deps literal reads `eqWorkspace: seams.eqWorkspace ?? eqWorkspace,`; the `AnimationDirector` deps literal reads `equityFills$: seams.equityFills$ ?? ordersBlotter.fills$,`. The `presenters` literal keeps `eqWorkspace,` (the base's own). Export `type CoreSeams` from `packages/client-core/src/index.ts` wherever `createApp` is exported.

Run: the seam test — PASS; then `pnpm --filter @rtc/client-core exec vitest run` — the whole package green.

- [ ] **Step 7: Commit**

```bash
git add packages/domain packages/client-core
git commit -m "refactor(client-core): equities state transitions as pure folds; createApp core seams; CANDLE_HISTORY_RETRY_COOLDOWN_MS in domain" -- packages/domain packages/client-core
```

(Trailer per Global Constraints. No build in this wave — the controller rebuilds before Task 3.)

### Task 2: Harness — scripted equities ports, a seedable watchlist, a streaming pending queue

**Files:**
- Modify: `packages/core-contract/src/harness/pendingQueue.ts`, `pendingQueue.test.ts`, `scriptedPorts.ts`, `scriptedPorts.test.ts`, `harness.ts`, `fixtures.ts`, `packages/core-contract/src/index.ts`

**Interfaces:**
- Consumes: `@rtc/domain` types that exist today (`Candle`, `CandleTimeframe`, `DepthBook`, `EquityInstrument`, `EquityOrder`, `EquityPosition`, `EquityQuote`, `MarketDataPort`, `OrderPort`, `PlaceOrderRequest`, `PositionPort`).
- Produces (Task 3's suites and the three runners use exactly these names):
  - `PendingQueue.emit(value: Res): void` (next on the OLDEST pending result, which stays pending) and `PendingQueue.complete(): void` (complete the oldest and drop it)
  - `interface HarnessSeed { readonly watchlist?: readonly EquityInstrument[] }`; `type MakeHarness = (seed?: HarnessSeed) => CoreHarness`; `scriptPorts(base: AppPorts, seed?: HarnessSeed): ScriptedPorts`
  - `interface CandleHistoryRequest { readonly symbol: string; readonly timeframe: CandleTimeframe; readonly beforeTime: number; readonly count: number }`
  - `PortMethodName` gains `"marketData.watchlist" | "positions.positions"`
  - Driver verbs: `emitWatchlist(list)`, `watchlistObserved()`, `emitEquityQuote(quote)`, `equityQuoteObserved(symbol)`, `emitCandles(symbol, timeframe, candles)`, `candlesObserved(symbol, timeframe)`, `pendingCandleHistory()`, `resolveCandleHistory(page)`, `failCandleHistory(error)`, `emitDepth(book)`, `depthObserved(symbol)`, `setOrderBook(orders)`, `pendingOrders()`, `emitOrderUpdate(order)`, `completeOrder()`, `failOrder(error)`, `emitPositions(positions)`, `positionsObserved()`
  - Fixtures: `AAPL`, `MSFT`, `TSLA` (`EquityInstrument`), `createEquityQuote(symbol, last, at?)`, `createCandle(time, close?)`, `createCandles(count, fromTime, stepMs?)`, `createDepthBook(symbol, mid?)`, `createEquityOrder(overrides?)`, `createEquityPosition(symbol, qty?)`

- [ ] **Step 1: Failing queue tests.** Add to `pendingQueue.test.ts`: (a) `emit` delivers a value to the oldest pending subscriber WITHOUT completing it and leaves it pending — two emits arrive in order and `pending()` still lists the request; (b) `complete` completes the oldest and removes it, and a following `emit` reaches the next one; (c) `emit` and `complete` with nothing pending are no-ops. Run `pnpm --filter @rtc/core-contract exec vitest run src/harness/pendingQueue.test.ts` — FAIL (`emit` is not a function).

- [ ] **Step 2: Extend the queue.** In `pendingQueue.ts` add to the interface, with the doc line "A lifecycle port (`orders.place`) emits several values per request: `emit` is one of them, `complete` ends it. `resolve` stays `emit` + `complete` for the one-shot ports.":

```ts
  /** Next on the OLDEST pending result; it stays pending. */
  emit(value: Res): void;
  /** Complete the OLDEST pending result and drop it from the queue. */
  complete(): void;
```

and to the returned object:

```ts
    emit: (value: Res) => {
      queue[0]?.result.next(value);
    },
    complete: () => {
      settleOldest((result) => {
        result.complete();
      });
    },
```

Run the queue tests — PASS.

- [ ] **Step 3: Fixtures.** Append to `fixtures.ts` (imports: `Candle`, `DepthBook`, `EquityInstrument`, `EquityOrder`, `EquityPosition`, `EquityQuote` from `@rtc/domain`):

```ts
export const AAPL: EquityInstrument = {
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
};
export const MSFT: EquityInstrument = {
  symbol: "MSFT",
  name: "Microsoft Corp.",
  exchange: "NASDAQ",
};
export const TSLA: EquityInstrument = {
  symbol: "TSLA",
  name: "Tesla Inc.",
  exchange: "NASDAQ",
};

/** An equity quote around `last` with a 2-cent spread. */
export function createEquityQuote(
  symbol: string,
  last: number,
  at = 0,
): EquityQuote {
  return {
    symbol,
    bid: last - 0.01,
    ask: last + 0.01,
    last,
    changePct: 0,
    timestamp: at,
  };
}

export function createCandle(time: number, close = 100): Candle {
  return {
    time,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000,
  };
}

/** `count` candles ascending from `fromTime`, one per `stepMs`. */
export function createCandles(
  count: number,
  fromTime: number,
  stepMs = 60_000,
): readonly Candle[] {
  return Array.from({ length: count }, (_unused, index) => {
    return createCandle(fromTime + index * stepMs);
  });
}

export function createDepthBook(symbol: string, mid = 100): DepthBook {
  return {
    symbol,
    bids: [{ price: mid - 0.01, size: 100 }],
    asks: [{ price: mid + 0.01, size: 100 }],
  };
}

export function createEquityOrder(
  overrides: Partial<EquityOrder> = {},
): EquityOrder {
  return {
    id: "ord-1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "working",
    filledQty: 0,
    createdAt: 0,
    ...overrides,
  };
}

export function createEquityPosition(symbol: string, qty = 100): EquityPosition {
  return { symbol, qty, avgPrice: 100, markPrice: 101, unrealisedPnl: qty };
}
```

- [ ] **Step 4: Failing scripted-port tests.** Add a `describe("scriptPorts — equities")` block to `scriptedPorts.test.ts`, following the file's existing construction of `base`. Cases:
  - a seeded watchlist is delivered SYNCHRONOUSLY to the first subscriber of `ports.marketData.watchlist()`; an unseeded one is silent until `emitWatchlist`, after which a late subscriber replays it; `portCalls("marketData.watchlist")` counts calls, not subscriptions.
  - `emitEquityQuote` reaches only that symbol's subscribers; `equityQuoteObserved` flips with subscribe/unsubscribe; `emitDepth`/`depthObserved` likewise.
  - `emitCandles("AAPL", "1W", …)` reaches `candles("AAPL", "1W")` and not `candles("AAPL")`; `candles("AAPL")` and `candles("AAPL", "1D")` share a key.
  - `candleHistory` is lazy (pending only once subscribed), the pending request is `{ symbol, timeframe, beforeTime, count }`, `resolveCandleHistory` emits the page and completes, `failCandleHistory` errors.
  - `orders.place` is lazy; `emitOrderUpdate` twice then `completeOrder` delivers both and completes; `failOrder` errors; an unsubscribe withdraws the pending order.
  - `orders.orders()` emits the CURRENT book on each subscribe (`setOrderBook` between two subscriptions shows through) and completes.
  - `emitPositions` / `positionsObserved`; `portCalls("positions.positions")`.

Run — FAIL.

- [ ] **Step 5: The scripted ports.** In `harness.ts`:

```ts
import type { HarnessSeed, ScriptedDriver } from "#/harness/scriptedPorts";

/** A runner builds one harness per test. The optional seed is state the
 * world must ALREADY hold when the app is composed — a driver verb can only
 * act afterwards. */
export type MakeHarness = (seed?: HarnessSeed) => CoreHarness;
```

In `scriptedPorts.ts` — imports gain `ReplaySubject`, `defer`, `of` from `rxjs` and the domain types listed above. Add:

```ts
/** What the world holds BEFORE the app is composed. `eqWorkspace` reads the
 * watchlist once, synchronously, at composition (the simulator's
 * `of(WATCHLIST)` path, the deployed default) — a roster pushed through
 * `emitWatchlist` can only ever exercise the asynchronous fallback. */
export interface HarnessSeed {
  readonly watchlist?: readonly EquityInstrument[];
}

/** What `marketData.candleHistory` was asked for. */
export interface CandleHistoryRequest {
  readonly symbol: string;
  readonly timeframe: CandleTimeframe;
  readonly beforeTime: number;
  readonly count: number;
}
```

`PortMethodName` gains `| "marketData.watchlist" | "positions.positions"` and its doc gains "and the two equities singletons every core calls once at construction. `marketData.quotes/candles/depth` are per-key and `candleHistory`, `orders.place`, `orders.orders` per-invocation — none of them under the constancy rule."

Generalise the live-subject helper (replace `priceSubject` and its call site with it):

```ts
  /** The live Subject for a key — replaced after a failure, so the next
   * subscription starts clean (a terminated Subject would replay its error). */
  function liveSubject<T>(subjects: Map<string, Subject<T>>, key: string): Subject<T> {
    const existing = subjects.get(key);

    if (existing !== undefined && !existing.closed && !existing.hasError) {
      return existing;
    }

    const fresh = new Subject<T>();
    subjects.set(key, fresh);
    return fresh;
  }

  /** A per-key port stream: deferred so each SUBSCRIPTION resolves the live
   * Subject. */
  function keyedStream<T>(subjects: Map<string, Subject<T>>, key: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      return liveSubject(subjects, key).subscribe(subscriber);
    });
  }
```

(`pricing.getPriceUpdates` becomes `return keyedStream(prices, symbol);`.) `scriptPorts(base: AppPorts, seed: HarnessSeed = {})` — new state:

```ts
  const watchlist$ = new ReplaySubject<readonly EquityInstrument[]>(1);
  const equityQuotes = new Map<string, Subject<EquityQuote>>();
  const candleSeries = new Map<string, Subject<readonly Candle[]>>();
  const depthBooks = new Map<string, Subject<DepthBook>>();
  const candleHistory = createPendingQueue<CandleHistoryRequest, readonly Candle[]>();
  const orderPlacements = createPendingQueue<PlaceOrderRequest, EquityOrder>();
  const positions$ = new Subject<readonly EquityPosition[]>();
  let orderBook: readonly EquityOrder[] = [];

  if (seed.watchlist !== undefined) {
    watchlist$.next(seed.watchlist);
  }

  function candleKey(symbol: string, timeframe: CandleTimeframe = "1D"): string {
    return `${symbol}|${timeframe}`;
  }
```

and the three ports:

```ts
  const marketData: MarketDataPort = {
    watchlist: (): Observable<readonly EquityInstrument[]> => {
      recordCall("marketData.watchlist");
      return watchlist$;
    },
    quotes: (symbol: string): Observable<EquityQuote> => {
      return keyedStream(equityQuotes, symbol);
    },
    candles: (
      symbol: string,
      timeframe?: CandleTimeframe,
    ): Observable<readonly Candle[]> => {
      return keyedStream(candleSeries, candleKey(symbol, timeframe));
    },
    candleHistory: (
      symbol: string,
      timeframe: CandleTimeframe,
      beforeTime: number,
      count: number,
    ): Observable<readonly Candle[]> => {
      return candleHistory.open({ symbol, timeframe, beforeTime, count });
    },
    depth: (symbol: string): Observable<DepthBook> => {
      return keyedStream(depthBooks, symbol);
    },
  };

  const orders: OrderPort = {
    // A lifecycle stream: pending from SUBSCRIBE, several updates, then
    // (optionally) completion.
    place: (request: PlaceOrderRequest): Observable<EquityOrder> => {
      return orderPlacements.open(request);
    },
    // No presenter cancels an order today; the base keeps the method honest.
    cancel: (orderId: string): Observable<void> => {
      return base.orders.cancel(orderId);
    },
    // A one-shot snapshot of whatever the book holds when SUBSCRIBED.
    orders: (): Observable<readonly EquityOrder[]> => {
      return defer(() => {
        return of(orderBook);
      });
    },
  };

  const positions: PositionPort = {
    positions: (): Observable<readonly EquityPosition[]> => {
      recordCall("positions.positions");
      return positions$;
    },
  };
```

Add `marketData`, `orders`, `positions` to the returned `ports`. Driver verbs (declare each in `ScriptedDriver` with a one-line doc in the existing style — "Push the equities roster into `marketData.watchlist()`", "Every `orders.place` the core has subscribed and the driver has not completed, oldest first", …):

```ts
      emitWatchlist: (list: readonly EquityInstrument[]) => {
        watchlist$.next(list);
      },
      watchlistObserved: () => {
        return watchlist$.observed;
      },
      emitEquityQuote: (quote: EquityQuote) => {
        equityQuotes.get(quote.symbol)?.next(quote);
      },
      equityQuoteObserved: (symbol: string) => {
        return equityQuotes.get(symbol)?.observed ?? false;
      },
      emitCandles: (
        symbol: string,
        timeframe: CandleTimeframe,
        candles: readonly Candle[],
      ) => {
        candleSeries.get(candleKey(symbol, timeframe))?.next(candles);
      },
      candlesObserved: (symbol: string, timeframe: CandleTimeframe) => {
        return candleSeries.get(candleKey(symbol, timeframe))?.observed ?? false;
      },
      pendingCandleHistory: candleHistory.pending,
      resolveCandleHistory: candleHistory.resolve,
      failCandleHistory: candleHistory.fail,
      emitDepth: (book: DepthBook) => {
        depthBooks.get(book.symbol)?.next(book);
      },
      depthObserved: (symbol: string) => {
        return depthBooks.get(symbol)?.observed ?? false;
      },
      setOrderBook: (next: readonly EquityOrder[]) => {
        orderBook = next;
      },
      pendingOrders: orderPlacements.pending,
      emitOrderUpdate: orderPlacements.emit,
      completeOrder: orderPlacements.complete,
      failOrder: orderPlacements.fail,
      emitPositions: (next: readonly EquityPosition[]) => {
        positions$.next(next);
      },
      positionsObserved: () => {
        return positions$.observed;
      },
```

`teardown` completes `watchlist$`, `positions$` and every Subject in the three new maps, and drains `candleHistory` and `orderPlacements`. Update `scriptPorts`' doc comment ("…the five FX ports, the three credit ports plus `pricing.getRfqQuote`, and the three equities ports…").

- [ ] **Step 6: Exports.** `packages/core-contract/src/index.ts`: add the nine fixtures to the `#/harness/fixtures` block and `type CandleHistoryRequest`, `type HarnessSeed` to the `#/harness/scriptedPorts` block.

- [ ] **Step 7: Run and commit.** `pnpm --filter @rtc/core-contract exec vitest run` — PASS (the existing suites still compile: a zero-parameter runner function is assignable to `MakeHarness`).

```bash
git add packages/core-contract
git commit -m "test(core-contract): scripted equities ports, seedable watchlist, streaming pending queue" -- packages/core-contract
```

### Task 3: The eight suites, port discipline, registry, runners — then ship PR A

**Files:**
- Create: `packages/core-contract/src/suites/{watchlist,depth,positions,ordersBlotter,candleSeries,eqWorkspace,eqDrawings,orderTicket}.ts`
- Modify: `packages/core-contract/src/suites/portDiscipline.ts`, `src/registry.ts`, `src/registry.test.ts`
- Modify: `packages/client-core/src/composition.coreContract.test.ts`, `packages/client-core-async/src/coreContract.test.ts`, `packages/client-core-effect/src/coreContract.test.ts`

**Interfaces:**
- Consumes: Task 2's driver verbs, fixtures, `HarnessSeed`; Task 1's `CANDLE_HISTORY_RETRY_COOLDOWN_MS`.
- Produces: `describeWatchlistContract`, `describeDepthContract`, `describePositionsContract`, `describeOrdersBlotterContract`, `describeCandleSeriesContract`, `describeEqWorkspaceContract`, `describeEqDrawingsContract`, `describeOrderTicketContract` — each `(label: string, makeHarness: MakeHarness) => void`.

**Before starting:** the controller has rebuilt every dist (`pnpm build`) on the commit that holds Tasks 1 and 2.

Every suite file opens with the same imports as `suites/rfqs.ts` (`describe, expect, it` from `vitest`; `collect`; the fixtures it names; `type MakeHarness`; `settle`) and wraps each case in `const h = makeHarness(); try { … } finally { await h.teardown(); }`. **Discipline (R5):** an exact `toEqual([...])` on `values` only across settle-separated emissions; otherwise `values.at(-1)`.

- [ ] **Step 1: `watchlist.ts`**

```ts
export function describeWatchlistContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("watchlist$ is silent until the roster arrives, replays it synchronously to a late subscriber, and stays warm across zero subscribers", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.watchlist;
        const c = collect(p.watchlist$);
        expect(c.values).toEqual([]);
        h.driver.emitWatchlist([AAPL, MSFT]);
        await settle();
        expect(c.values).toEqual([[AAPL, MSFT]]);
        const late = collect(p.watchlist$);
        expect(late.values).toEqual([[AAPL, MSFT]]);
        c.unsubscribe();
        late.unsubscribe();
        await settle();
        expect(h.driver.watchlistObserved()).toBe(true);
        expect(c.errors).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("a roster the world already holds is delivered synchronously to the first subscriber", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const c = collect(h.app.presenters.watchlist.watchlist$);
        expect(c.values).toEqual([[AAPL]]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("quote$(symbol) is memoised per symbol", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.watchlist;
        expect(p.quote$("AAPL")).toBe(p.quote$("AAPL"));
        expect(p.quote$("AAPL")).not.toBe(p.quote$("MSFT"));
      } finally {
        await h.teardown();
      }
    });

    it("quote$ delivers its own symbol's quotes only, replays the latest to a late joiner, releases the port on the last unsubscribe, and a fresh warm period starts with no replay", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.watchlist;
        const aapl = collect(p.quote$("AAPL"));
        const msft = collect(p.quote$("MSFT"));
        await settle();
        const first = createEquityQuote("AAPL", 190);
        h.driver.emitEquityQuote(first);
        await settle();
        expect(aapl.values).toEqual([first]);
        expect(msft.values).toEqual([]);
        const late = collect(p.quote$("AAPL"));
        expect(late.values).toEqual([first]);
        aapl.unsubscribe();
        msft.unsubscribe();
        late.unsubscribe();
        await settle();
        expect(h.driver.equityQuoteObserved("AAPL")).toBe(false);
        const again = collect(p.quote$("AAPL"));
        expect(again.values).toEqual([]);
        await settle();
        const second = createEquityQuote("AAPL", 191);
        h.driver.emitEquityQuote(second);
        await settle();
        expect(again.values).toEqual([second]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

- [ ] **Step 2: `depth.ts` and `positions.ts`.** `describeDepthContract`: two cases with the bodies of the `quote$` pair above, over `h.app.presenters.depth.depth$(symbol)`, `createDepthBook("AAPL", 100)` / `createDepthBook("AAPL", 101)`, `h.driver.emitDepth(book)` and `h.driver.depthObserved("AAPL")` — titles `"depth$(symbol) is memoised per symbol"` and `"depth$ delivers its own symbol's books only, replays the latest to a late joiner, releases the port on the last unsubscribe, and a fresh warm period starts with no replay"`. `describePositionsContract`: one case with the body of the first `watchlist$` case over `h.app.presenters.positions.positions$`, `[createEquityPosition("AAPL")]`, `h.driver.emitPositions` and `h.driver.positionsObserved()` — title `"positions$ is silent until the book arrives, replays it synchronously to a late subscriber, and stays warm across zero subscribers"`.

- [ ] **Step 3: `ordersBlotter.ts`**

```ts
const REQUEST: PlaceOrderRequest = {
  symbol: "AAPL",
  side: "buy",
  type: "limit",
  qty: 100,
  limitPrice: 190,
};

export function describeOrdersBlotterContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("orders$ delivers the book the port holds, and replays it synchronously to a late subscriber", async () => {
      const h = makeHarness();

      try {
        const resting = createEquityOrder({ id: "ord-0" });
        h.driver.setOrderBook([resting]);
        const c = collect(h.app.presenters.ordersBlotter.orders$);
        await settle();
        expect(c.values.at(-1)).toEqual([resting]);
        const late = collect(h.app.presenters.ordersBlotter.orders$);
        expect(late.values).toEqual([[resting]]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("place() is lazy, passes the request through verbatim, delivers each lifecycle update in order, and an unsubscribe withdraws the order", async () => {
      const h = makeHarness();

      try {
        const result = h.app.presenters.ordersBlotter.place(REQUEST);
        expect(h.driver.pendingOrders()).toEqual([]);
        const c = collect(result);
        await settle();
        expect(h.driver.pendingOrders()).toEqual([REQUEST]);
        const working = createEquityOrder({ status: "working" });
        const partial = createEquityOrder({
          status: "partiallyFilled",
          filledQty: 40,
        });
        h.driver.emitOrderUpdate(working);
        await settle();
        h.driver.emitOrderUpdate(partial);
        await settle();
        expect(c.values).toEqual([working, partial]);
        c.unsubscribe();
        await settle();
        expect(h.driver.pendingOrders()).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("every lifecycle update re-queries the book: orders$ shows what the port holds after it", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.ordersBlotter;
        const orders = collect(p.orders$);
        await settle();
        expect(orders.values.at(-1)).toEqual([]);
        const placed = collect(p.place(REQUEST));
        await settle();
        const working = createEquityOrder({ status: "working" });
        h.driver.setOrderBook([working]);
        h.driver.emitOrderUpdate(working);
        await settle();
        expect(orders.values.at(-1)).toEqual([working]);
        orders.unsubscribe();
        placed.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("fills$ emits the symbol once when an order reaches filled — not before — and does not replay to a late subscriber", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.ordersBlotter;
        const fills = collect(p.fills$);
        await settle();
        const placed = collect(p.place(REQUEST));
        await settle();
        h.driver.emitOrderUpdate(createEquityOrder({ status: "working" }));
        await settle();
        h.driver.emitOrderUpdate(
          createEquityOrder({ status: "partiallyFilled", filledQty: 40 }),
        );
        await settle();
        expect(fills.values).toEqual([]);
        h.driver.emitOrderUpdate(
          createEquityOrder({ status: "filled", filledQty: 100 }),
        );
        await settle();
        expect(fills.values).toEqual([{ symbol: "AAPL" }]);
        const late = collect(p.fills$);
        await settle();
        expect(late.values).toEqual([]);
        fills.unsubscribe();
        late.unsubscribe();
        placed.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a failing order errors the result; fills$ hears nothing", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.ordersBlotter;
        const fills = collect(p.fills$);
        await settle();
        const placed = collect(p.place(REQUEST));
        await settle();
        h.driver.failOrder(new Error("bust"));
        await settle();
        expect(placed.errors).toHaveLength(1);
        expect(placed.values).toEqual([]);
        expect(fills.values).toEqual([]);
        fills.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("orders$ stays warm across zero subscribers: a lifecycle update still refreshes it, and a fresh subscriber replays the latest book synchronously", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.ordersBlotter;
        const first = collect(p.orders$);
        await settle();
        first.unsubscribe();
        await settle();
        const placed = collect(p.place(REQUEST));
        await settle();
        const filled = createEquityOrder({ status: "filled", filledQty: 100 });
        h.driver.setOrderBook([filled]);
        h.driver.emitOrderUpdate(filled);
        await settle();
        const again = collect(p.orders$);
        expect(again.values).toEqual([[filled]]);
        again.unsubscribe();
        placed.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

- [ ] **Step 4: `candleSeries.ts`**

```ts
const T0 = 1_700_000_000_000;
const STEP_MS = 60_000;
const BASE = createCandles(3, T0, STEP_MS);

function times(series: readonly Candle[] | undefined): number[] {
  return (series ?? []).map((candle) => {
    return candle.time;
  });
}

export function describeCandleSeriesContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("candles$ is memoised per (symbol, timeframe), and an omitted timeframe is 1D", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        expect(p.candles$("AAPL")).toBe(p.candles$("AAPL", "1D"));
        expect(p.candles$("AAPL")).not.toBe(p.candles$("AAPL", "1W"));
        expect(p.candles$("AAPL")).not.toBe(p.candles$("MSFT"));
      } finally {
        await h.teardown();
      }
    });

    it("an empty symbol is an empty series, synchronously, and loadOlder on it is a no-op", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const c = collect(p.candles$(""));
        expect(c.values).toEqual([[]]);
        p.loadOlder("");
        await settle();
        expect(h.driver.pendingCandleHistory()).toEqual([]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("delivers the base series, follows live appends, and replays the latest to a late joiner synchronously", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const c = collect(p.candles$("AAPL"));
        expect(c.values).toEqual([]);
        await settle();
        h.driver.emitCandles("AAPL", "1D", BASE);
        await settle();
        expect(times(c.values.at(-1))).toEqual(times(BASE));
        const appended = [...BASE, createCandle(T0 + 3 * STEP_MS)];
        h.driver.emitCandles("AAPL", "1D", appended);
        await settle();
        expect(times(c.values.at(-1))).toEqual(times(appended));
        const late = collect(p.candles$("AAPL"));
        expect(late.values.map(times)).toEqual([times(appended)]);
        c.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("the backfill flags start false, synchronously", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const loading = collect(p.loadingOlder$("AAPL"));
        const exhausted = collect(p.historyExhausted$("AAPL"));
        expect(loading.values).toEqual([false]);
        expect(exhausted.values).toEqual([false]);
        loading.unsubscribe();
        exhausted.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("loadOlder before the series has emitted is a no-op", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const c = collect(p.candles$("AAPL"));
        await settle();
        p.loadOlder("AAPL");
        await settle();
        expect(h.driver.pendingCandleHistory()).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("loadOlder asks for one page before the series' first candle, single-flight; a FULL page is prepended and the next load anchors at the new first candle; a SHORT page latches exhaustion", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const c = collect(p.candles$("AAPL"));
        const loading = collect(p.loadingOlder$("AAPL"));
        const exhausted = collect(p.historyExhausted$("AAPL"));
        await settle();
        h.driver.emitCandles("AAPL", "1D", BASE);
        await settle();
        p.loadOlder("AAPL");
        p.loadOlder("AAPL");
        await settle();
        expect(h.driver.pendingCandleHistory()).toEqual([
          {
            symbol: "AAPL",
            timeframe: "1D",
            beforeTime: T0,
            count: CANDLE_HISTORY_PAGE,
          },
        ]);
        expect(loading.values.at(-1)).toBe(true);
        const pageStart = T0 - CANDLE_HISTORY_PAGE * STEP_MS;
        h.driver.resolveCandleHistory(
          createCandles(CANDLE_HISTORY_PAGE, pageStart, STEP_MS),
        );
        await settle();
        const stitched = c.values.at(-1) ?? [];
        expect(stitched).toHaveLength(CANDLE_HISTORY_PAGE + BASE.length);
        expect(stitched[0]?.time).toBe(pageStart);
        expect(stitched.at(-1)?.time).toBe(BASE.at(-1)?.time);
        expect(loading.values.at(-1)).toBe(false);
        expect(exhausted.values.at(-1)).toBe(false);
        p.loadOlder("AAPL");
        await settle();
        expect(h.driver.pendingCandleHistory()[0]?.beforeTime).toBe(pageStart);
        h.driver.resolveCandleHistory(
          createCandles(2, pageStart - 2 * STEP_MS, STEP_MS),
        );
        await settle();
        expect(c.values.at(-1)).toHaveLength(CANDLE_HISTORY_PAGE + 5);
        expect(exhausted.values.at(-1)).toBe(true);
        p.loadOlder("AAPL");
        await settle();
        expect(h.driver.pendingCandleHistory()).toEqual([]);
        c.unsubscribe();
        loading.unsubscribe();
        exhausted.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("an EMPTY page latches exhaustion and leaves the series alone; a page overlapping the base never duplicates a candle", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const aapl = collect(p.candles$("AAPL"));
        const msft = collect(p.candles$("MSFT"));
        const exhausted = collect(p.historyExhausted$("AAPL"));
        await settle();
        h.driver.emitCandles("AAPL", "1D", BASE);
        h.driver.emitCandles("MSFT", "1D", BASE);
        await settle();
        p.loadOlder("AAPL");
        await settle();
        h.driver.resolveCandleHistory([]);
        await settle();
        expect(exhausted.values.at(-1)).toBe(true);
        expect(times(aapl.values.at(-1))).toEqual(times(BASE));
        p.loadOlder("MSFT");
        await settle();
        h.driver.resolveCandleHistory([
          createCandle(T0 - STEP_MS),
          createCandle(T0, 999),
        ]);
        await settle();
        expect(times(msft.values.at(-1))).toEqual([T0 - STEP_MS, ...times(BASE)]);
        expect(msft.values.at(-1)?.[1]?.close).toBe(BASE[0]?.close);
        aapl.unsubscribe();
        msft.unsubscribe();
        exhausted.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a failed page clears loading without latching exhaustion, blocks a retry for CANDLE_HISTORY_RETRY_COOLDOWN_MS, and allows one at the boundary", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const p = h.app.presenters.candleSeries;
          const c = collect(p.candles$("AAPL"));
          const loading = collect(p.loadingOlder$("AAPL"));
          const exhausted = collect(p.historyExhausted$("AAPL"));
          await clock.settle();
          h.driver.emitCandles("AAPL", "1D", BASE);
          await clock.settle();
          p.loadOlder("AAPL");
          await clock.settle();
          h.driver.failCandleHistory(new Error("bust"));
          await clock.settle();
          expect(loading.values.at(-1)).toBe(false);
          expect(exhausted.values.at(-1)).toBe(false);
          expect(c.errors).toEqual([]);
          p.loadOlder("AAPL");
          await clock.settle();
          expect(h.driver.pendingCandleHistory()).toEqual([]);
          await clock.advance(CANDLE_HISTORY_RETRY_COOLDOWN_MS - 1);
          p.loadOlder("AAPL");
          await clock.settle();
          expect(h.driver.pendingCandleHistory()).toEqual([]);
          await clock.advance(1);
          p.loadOlder("AAPL");
          await clock.settle();
          expect(h.driver.pendingCandleHistory()).toHaveLength(1);
          c.unsubscribe();
          loading.unsubscribe();
          exhausted.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("releases the port on the last unsubscribe, and a fresh warm period starts over: no replay, exhaustion cleared, the backfilled pages gone", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.candleSeries;
        const first = collect(p.candles$("AAPL"));
        await settle();
        h.driver.emitCandles("AAPL", "1D", BASE);
        await settle();
        p.loadOlder("AAPL");
        await settle();
        h.driver.resolveCandleHistory([createCandle(T0 - STEP_MS)]);
        await settle();
        expect(first.values.at(-1)).toHaveLength(BASE.length + 1);
        first.unsubscribe();
        await settle();
        expect(h.driver.candlesObserved("AAPL", "1D")).toBe(false);
        const again = collect(p.candles$("AAPL"));
        expect(again.values).toEqual([]);
        const exhausted = collect(p.historyExhausted$("AAPL"));
        expect(exhausted.values.at(-1)).toBe(false);
        await settle();
        h.driver.emitCandles("AAPL", "1D", BASE);
        await settle();
        expect(times(again.values.at(-1))).toEqual(times(BASE));
        again.unsubscribe();
        exhausted.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

Imports for this file: `CANDLE_HISTORY_PAGE`, `CANDLE_HISTORY_RETRY_COOLDOWN_MS`, `type Candle` from `@rtc/domain`; `withFakeClock` from `#/harness/clock`; `createCandle`, `createCandles` from the fixtures. `times` sits BELOW `describeCandleSeriesContract` in the file if `rtc/newspaper-order` asks (suite files are not `*.test.ts`; follow whatever `suites/priceHistory.ts` does with its `mids` helper — it keeps it above).

- [ ] **Step 5: `eqWorkspace.ts`**

```ts
const SEEDED: EqWorkspaceState = {
  sel: "AAPL",
  openTabs: ["AAPL"],
  timeframe: "1D",
  chartType: "candles",
  indicators: [],
  panes: [],
  yScale: "linear",
  compare: null,
};

export function describeEqWorkspaceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("opens on the first symbol of the roster the world already holds — synchronously, as its first state", async () => {
      const h = makeHarness({ watchlist: [AAPL, MSFT] });

      try {
        const c = collect(h.app.presenters.eqWorkspace.state$);
        expect(c.values).toEqual([SEEDED]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("with no roster yet it starts empty — no phantom tab — ignores an empty roster, seeds from the first non-empty one, and never re-seeds", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.eqWorkspace.state$);
        expect(c.values).toEqual([{ ...SEEDED, sel: "", openTabs: [] }]);
        h.driver.emitWatchlist([]);
        await settle();
        expect(c.values.at(-1)?.sel).toBe("");
        h.driver.emitWatchlist([MSFT, AAPL]);
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...SEEDED,
          sel: "MSFT",
          openTabs: ["MSFT"],
        });
        h.driver.emitWatchlist([AAPL]);
        await settle();
        expect(c.values.at(-1)?.sel).toBe("MSFT");
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a selection made before the roster arrives wins over the seed", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.eqWorkspace;
        const c = collect(m.state$);
        m.intents.select("TSLA");
        await settle();
        h.driver.emitWatchlist([AAPL]);
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...SEEDED,
          sel: "TSLA",
          openTabs: ["TSLA"],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("select opens a tab once and selects it; closeTab never empties the strip and hands a closed selection to its neighbour", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const m = h.app.presenters.eqWorkspace;
        const c = collect(m.state$);
        m.intents.select("MSFT");
        m.intents.select("TSLA");
        m.intents.select("MSFT");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: "MSFT",
          openTabs: ["AAPL", "MSFT", "TSLA"],
        });
        m.intents.closeTab("NVDA");
        m.intents.closeTab("AAPL");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: "MSFT",
          openTabs: ["MSFT", "TSLA"],
        });
        m.intents.closeTab("MSFT");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: "TSLA",
          openTabs: ["TSLA"],
        });
        m.intents.closeTab("TSLA");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: "TSLA",
          openTabs: ["TSLA"],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("closing the selected LAST tab selects the new last tab", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const m = h.app.presenters.eqWorkspace;
        const c = collect(m.state$);
        m.intents.select("MSFT");
        m.intents.closeTab("MSFT");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: "AAPL",
          openTabs: ["AAPL"],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("chart settings: timeframe and chart type are set; indicators and panes toggle independently; the y-scale flips", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const m = h.app.presenters.eqWorkspace;
        const c = collect(m.state$);
        m.intents.setTimeframe("1W");
        m.intents.setChartType("line");
        m.intents.toggleIndicator("sma20");
        m.intents.toggleIndicator("ema50");
        m.intents.toggleIndicator("sma20");
        m.intents.togglePane("rsi");
        m.intents.toggleYScale();
        await settle();
        expect(c.values.at(-1)).toEqual({
          ...SEEDED,
          timeframe: "1W",
          chartType: "line",
          indicators: ["ema50"],
          panes: ["rsi"],
          yScale: "log",
        });
        m.intents.togglePane("rsi");
        m.intents.toggleYScale();
        await settle();
        expect(c.values.at(-1)).toMatchObject({ panes: [], yScale: "linear" });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("compare: set and cleared; comparing the selection against itself is ignored; selecting the compared symbol clears it; the y-scale is never touched", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const m = h.app.presenters.eqWorkspace;
        const c = collect(m.state$);
        m.intents.toggleYScale();
        m.intents.setCompare("MSFT");
        await settle();
        expect(c.values.at(-1)).toMatchObject({ compare: "MSFT", yScale: "log" });
        m.intents.setCompare("AAPL");
        await settle();
        expect(c.values.at(-1)?.compare).toBe("MSFT");
        m.intents.select("MSFT");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          sel: "MSFT",
          compare: null,
          yScale: "log",
        });
        m.intents.setCompare("AAPL");
        m.intents.setCompare(null);
        await settle();
        expect(c.values.at(-1)?.compare).toBeNull();
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("is warm with nobody watching: a change made with zero subscribers is what getValue() reads and what the next subscriber hears first", async () => {
      const h = makeHarness({ watchlist: [AAPL] });

      try {
        const m = h.app.presenters.eqWorkspace;
        m.intents.select("MSFT");
        await settle();
        expect(m.state$.getValue()).toMatchObject({ sel: "MSFT" });
        const c = collect(m.state$);
        expect(c.values).toHaveLength(1);
        expect(c.values[0]).toMatchObject({
          sel: "MSFT",
          openTabs: ["AAPL", "MSFT"],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

Import `type EqWorkspaceState` from `@rtc/core-api`.

- [ ] **Step 6: `eqDrawings.ts`**

```ts
const TREND: EqDrawing = {
  id: "t1",
  kind: "trendline",
  a: { index: 10, price: 100 },
  b: { index: 20, price: 110 },
};
const LEVEL: EqDrawing = { id: "h1", kind: "hline", price: 105 };

export function describeEqDrawingsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts on the cursor with no drawings and no selection — synchronously", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.eqDrawings.state$);
        expect(c.values).toEqual([
          { tool: "cursor", drawings: {}, selectedId: null },
        ]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("addDrawing appends per symbol, selects the new drawing and returns to the cursor; setTool drops the selection", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.eqDrawings;
        const c = collect(m.state$);
        m.intents.setTool("trendline");
        await settle();
        expect(c.values.at(-1)).toMatchObject({ tool: "trendline" });
        m.intents.addDrawing("AAPL", TREND);
        m.intents.addDrawing("AAPL", LEVEL);
        m.intents.addDrawing("MSFT", { ...LEVEL, id: "h2" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          tool: "cursor",
          drawings: { AAPL: [TREND, LEVEL], MSFT: [{ ...LEVEL, id: "h2" }] },
          selectedId: "h2",
        });
        m.intents.setTool("hline");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          tool: "hline",
          selectedId: null,
        });
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("updateDrawing replaces in place and ignores an unknown id; deleteSelected removes only a selected drawing of THAT symbol", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.eqDrawings;
        const c = collect(m.state$);
        m.intents.addDrawing("AAPL", TREND);
        m.intents.addDrawing("AAPL", LEVEL);
        const moved: EqDrawing = { id: "t1", kind: "hline", price: 99 };
        m.intents.updateDrawing("AAPL", moved);
        m.intents.updateDrawing("AAPL", { ...LEVEL, id: "ghost" });
        await settle();
        expect(c.values.at(-1)?.drawings).toEqual({ AAPL: [moved, LEVEL] });
        expect(c.values.at(-1)?.selectedId).toBe("h1");
        m.intents.deleteSelected("MSFT");
        await settle();
        expect(c.values.at(-1)?.drawings).toEqual({ AAPL: [moved, LEVEL] });
        m.intents.deleteSelected("AAPL");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          drawings: { AAPL: [moved] },
          selectedId: null,
        });
        m.intents.deleteSelected("AAPL");
        await settle();
        expect(c.values.at(-1)?.drawings).toEqual({ AAPL: [moved] });
        m.intents.selectDrawing("t1");
        await settle();
        expect(c.values.at(-1)?.selectedId).toBe("t1");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("shiftAnchors moves both anchors of that symbol's trendlines and nothing else", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.eqDrawings;
        const c = collect(m.state$);
        m.intents.addDrawing("AAPL", TREND);
        m.intents.addDrawing("AAPL", LEVEL);
        m.intents.addDrawing("MSFT", { ...TREND, id: "t2" });
        m.intents.shiftAnchors("AAPL", 300);
        m.intents.shiftAnchors("TSLA", 300);
        await settle();
        expect(c.values.at(-1)?.drawings).toEqual({
          AAPL: [
            {
              ...TREND,
              a: { index: 310, price: 100 },
              b: { index: 320, price: 110 },
            },
            LEVEL,
          ],
          MSFT: [{ ...TREND, id: "t2" }],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("is warm with nobody watching: a change made with zero subscribers is what getValue() reads and what the next subscriber hears first", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.eqDrawings;
        m.intents.setTool("hline");
        await settle();
        expect(m.state$.getValue()).toMatchObject({ tool: "hline" });
        const c = collect(m.state$);
        expect(c.values).toEqual([
          { tool: "hline", drawings: {}, selectedId: null },
        ]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

Import `type EqDrawing` from `@rtc/core-api`.

- [ ] **Step 7: `orderTicket.ts`**

```ts
const DEFAULT_FORM: OrderTicketForm = {
  symbol: "AAPL",
  side: "buy",
  type: "market",
  qty: 0,
};

function phases(values: readonly OrderTicketState[]): string[] {
  return values.map((state) => {
    return state.phase;
  });
}

export function describeOrderTicketContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts editing the default form for its symbol; each setter patches the form", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        expect(c.values).toEqual([
          { phase: "editing", form: DEFAULT_FORM, error: null },
        ]);
        m.intents.setSymbol("MSFT");
        m.intents.setSide("sell");
        m.intents.setType("limit");
        m.intents.setQty(50);
        m.intents.setLimitPrice(410);
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "editing",
          form: {
            symbol: "MSFT",
            side: "sell",
            type: "limit",
            qty: 50,
            limitPrice: 410,
          },
          error: null,
        });
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("an invalid submit stays editing with the reason and places nothing; the next edit clears the reason", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.submit();
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          phase: "editing",
          error: "Quantity must be greater than zero",
        });
        m.intents.setQty(10);
        m.intents.setType("limit");
        m.intents.submit();
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          phase: "editing",
          error: "Limit price required for a limit order",
        });
        expect(h.driver.pendingOrders()).toEqual([]);
        m.intents.setLimitPrice(190);
        await settle();
        expect(c.values.at(-1)).toMatchObject({ phase: "editing", error: null });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a valid submit → submitting with the form as the request, then each lifecycle update as its phase", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setType("limit");
        m.intents.setQty(100);
        m.intents.setLimitPrice(190);
        m.intents.submit();
        await settle();
        expect(c.values.at(-1)).toEqual({ phase: "submitting" });
        expect(h.driver.pendingOrders()).toEqual([
          {
            symbol: "AAPL",
            side: "buy",
            type: "limit",
            qty: 100,
            limitPrice: 190,
          },
        ]);
        const working = createEquityOrder({ status: "working" });
        h.driver.emitOrderUpdate(working);
        await settle();
        expect(c.values.at(-1)).toEqual({ phase: "working", order: working });
        const partial = createEquityOrder({
          status: "partiallyFilled",
          filledQty: 40,
        });
        h.driver.emitOrderUpdate(partial);
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "partiallyFilled",
          order: partial,
        });
        const filled = createEquityOrder({ status: "filled", filledQty: 100 });
        h.driver.emitOrderUpdate(filled);
        await settle();
        expect(c.values.at(-1)).toEqual({ phase: "filled", order: filled });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a rejected order lands as rejected with its reason", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        h.driver.emitOrderUpdate(createEquityOrder({ status: "rejected" }));
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "rejected",
          reason: "Order rejected",
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("while an order is in flight a form edit does not surface — but it is kept: the first edit after the fill shows both", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        h.driver.emitOrderUpdate(createEquityOrder({ status: "working" }));
        await settle();
        m.intents.setQty(5);
        await settle();
        expect(c.values.at(-1)?.phase).toBe("working");
        h.driver.emitOrderUpdate(
          createEquityOrder({ status: "filled", filledQty: 1 }),
        );
        await settle();
        m.intents.setSide("sell");
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "editing",
          form: { ...DEFAULT_FORM, qty: 5, side: "sell" },
          error: null,
        });
        expect(phases(c.values)).not.toContain("rejected");
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("reset after a fill returns to editing the default form", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        h.driver.emitOrderUpdate(
          createEquityOrder({ status: "filled", filledQty: 1 }),
        );
        await settle();
        m.intents.reset();
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "editing",
          form: DEFAULT_FORM,
          error: null,
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a second submit supersedes the order in flight: the first is withdrawn, the second's updates land", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        h.driver.emitOrderUpdate(createEquityOrder({ status: "working" }));
        await settle();
        m.intents.submit();
        await settle();
        expect(h.driver.pendingOrders()).toHaveLength(1);
        expect(c.values.at(-1)).toEqual({ phase: "submitting" });
        const filled = createEquityOrder({ id: "ord-2", status: "filled" });
        h.driver.emitOrderUpdate(filled);
        await settle();
        expect(c.values.at(-1)).toEqual({ phase: "filled", order: filled });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("an INVALID submit while an order is in flight withdraws it and shows the reason", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        expect(h.driver.pendingOrders()).toHaveLength(1);
        m.intents.setQty(0);
        m.intents.submit();
        await settle();
        expect(h.driver.pendingOrders()).toEqual([]);
        expect(c.values.at(-1)).toMatchObject({
          phase: "editing",
          error: "Quantity must be greater than zero",
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("dispose() after the last unsubscribe withdraws the order in flight; a later submit places nothing; a fresh subscription yields the current value synchronously", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        expect(h.driver.pendingOrders()).toHaveLength(1);
        c.unsubscribe();
        m.dispose();
        await settle();
        expect(h.driver.pendingOrders()).toEqual([]);
        m.intents.submit();
        await settle();
        expect(h.driver.pendingOrders()).toEqual([]);
        const fresh = collect(m.state$);
        expect(fresh.values).toHaveLength(1);
        fresh.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

Imports: `type OrderTicketForm`, `type OrderTicketState` from `@rtc/core-api`; `createEquityOrder`. **Known envelope question (rule on it if RxJS is red):** the last case's `fresh.values` is asserted by length only — what a disposed RxJS `state()` replays is its default, and slice 2 left the post-dispose VALUE uncontracted.

- [ ] **Step 8: Port discipline, registry, drift test.** `portDiscipline.ts`: two cases in the exact shape of the `currencyPairs` one — `"watchlist: subscribe, unsubscribe, subscribe again does not call marketData.watchlist() again"` (`h.app.presenters.watchlist.watchlist$`, `"marketData.watchlist"`) and `"positions: … positions.positions() …"` (`positions$`, `"positions.positions"`). `registry.ts`: import the eight `describe*Contract`s (Biome order); set `"presenters.watchlist"`, `"presenters.candleSeries"`, `"presenters.depth"`, `"presenters.ordersBlotter"`, `"presenters.positions"`, `"presenters.eqWorkspace"`, `"presenters.eqDrawings"`, `"machines.orderTicket"` to their suites; remove the eight from `PENDING_SUITES` (38 → 30). `registry.test.ts`: add `"slice 4 members have suites"` listing the eight, in the shape of the slice-3 case.

- [ ] **Step 9: The runners take the seed.** In each of the three runner files, the harness function gains the parameter and passes it on — e.g. `function createRxjsHarness(seed?: HarnessSeed): CoreHarness {` … `scriptPorts(base, seed)`; import `type HarnessSeed` from `@rtc/core-contract`. Nothing else changes.

- [ ] **Step 10: Run.** Controller: `pnpm --filter @rtc/core-contract build` (alone — nothing else is building), then `pnpm --filter @rtc/core-contract test`, then the three runners: `pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts`, `pnpm --filter @rtc/client-core-async exec vitest run src/coreContract.test.ts`, `pnpm --filter @rtc/client-core-effect exec vitest run src/coreContract.test.ts`. Expected: green on all three — RxJS meaningfully, the siblings trivially (they still delegate). A red case on RxJS is a suite defect or a real envelope finding: rule on it in the ledger, never loosen silently.

- [ ] **Step 11: The local CI mirror, then ship PR A.** `/rtc:gauntlet full`. Commit:

```bash
git add packages/core-contract packages/client-core packages/client-core-async packages/client-core-effect
git commit -m "test(core-contract): slice 4 suites — watchlist, candleSeries, depth, ordersBlotter, positions, eqWorkspace, eqDrawings, orderTicket; port discipline +2; PENDING_SUITES 38→30" -- packages/core-contract packages/client-core/src/composition.coreContract.test.ts packages/client-core-async/src/coreContract.test.ts packages/client-core-effect/src/coreContract.test.ts
```

Final whole-branch review (most capable model), one fix wave if it finds anything. Push, open PR A ("test(pluggable-core): slice 4 PR A — equities suites + scripted equities ports; pure folds; core seams"), loop CI on `headSha`, check CodeQL, merge `--merge`, confirm `merge-base --is-ancestor`, copy the SDD ledger out of `.superpowers/` (it is git-ignored) into the scratchpad, remove the worktree and branch.

---

## PR R — the run slot

Runs in its own worktree (`slice-4-r`), in parallel with PR A. Both tasks are behaviour-preserving refactors: **no existing test file is edited** in either package, and the 127-case contract runner of each core passes unchanged. The controller runs `pnpm build` once before dispatching; the implementers run `vitest` only.

### Task 4: `createRunSlot` in the async core

**Files:**
- Create: `packages/client-core-async/src/kernel/runSlot.ts`, `packages/client-core-async/src/kernel/runSlot.test.ts`
- Modify: `packages/client-core-async/src/machines/{tileExecution,rfqTile,rfqSubmission,ticketSubmission}.ts`, `packages/client-core-async/src/index.ts`

**Interfaces:**
- Produces (Task 6's `orderTicket` uses it):

```ts
export interface Run<S> {
  /** Aborts when this run is superseded, ended, or the slot is disposed. */
  readonly signal: AbortSignal;
  /** `store.set`, DROPPED once this run is no longer the live one. */
  set(next: S | ((previous: S) => S)): void;
  /** Run `step` unless this run is no longer the live one — for an effect
   * the world can see that is not a state write (a callback, a fold). */
  ifCurrent(step: () => void): void;
}

export interface RunSlot<S> {
  /** End the run in flight, if any, and start `body` as the live run. A
   * no-op once disposed. */
  start(body: (run: Run<S>) => Promise<void>): void;
  /** End the run in flight, if any. */
  end(): void;
  /** End the run in flight and refuse every later `start`. Idempotent. */
  dispose(): void;
  isDisposed(): boolean;
}

export function createRunSlot<S>(store: Store<S>): RunSlot<S>;
```

- [ ] **Step 1: Failing tests.** `runSlot.test.ts` (tests above helpers):
  - `start` runs the body with a live signal; `set` writes the store.
  - a second `start` aborts the first run's signal, and the first run's later `set` and `ifCurrent` are dropped.
  - **the window the slot exists to close:** a body awaits a promise the test controls; the test resolves it and, in the SAME tick (before the continuation's microtask), calls `slot.start(second)`; after `await Promise.resolve()` twice, the first run's `set("stale")` has NOT reached the store.
  - `end()` aborts without starting; `dispose()` aborts, makes `start` a no-op (the body is never called) and is idempotent; `isDisposed()` reports it.
  - a body that rejects with a non-abort error is reported through `reportAsync` (spy the macrotask rethrow with `vi.useFakeTimers()` + `expect(() => vi.runAllTimers()).toThrow("bust")`, the way `spawn.test.ts`/`topic.test.ts` already witness `reportAsync`); an `AbortError` rejection is silent.

Run `pnpm --filter @rtc/client-core-async exec vitest run src/kernel/runSlot.test.ts` — FAIL (module not found).

- [ ] **Step 2: The slot.** `packages/client-core-async/src/kernel/runSlot.ts`:

```ts
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
import type { Store } from "#/kernel/store";

export interface Run<S> {
  readonly signal: AbortSignal;
  set(next: S | ((previous: S) => S)): void;
  ifCurrent(step: () => void): void;
}

export interface RunSlot<S> {
  start(body: (run: Run<S>) => Promise<void>): void;
  end(): void;
  dispose(): void;
  isDisposed(): boolean;
}

/** "At most one live run" for a Store-backed machine — the RxJS `switchMap`
 * written once. `start` aborts the run in flight and begins the next under a
 * fresh signal; the run reaches the world only through its `Run`, whose
 * `set`/`ifCurrent` are dropped the moment that signal has aborted. That
 * guard is the point: an awaited resolution and a superseding `start` can
 * land in the same tick, and the continuation then runs one microtask AFTER
 * it has been superseded — an unguarded `store.set` there writes over its
 * successor's state. A failing body is rethrown on a macrotask
 * (`reportAsync`): a Store has no error channel (slice 2 ruling 8). */
export function createRunSlot<S>(store: Store<S>): RunSlot<S> {
  let active: AbortController | null = null;
  let disposed = false;

  function end(): void {
    active?.abort();
    active = null;
  }

  return {
    start: (body: (run: Run<S>) => Promise<void>) => {
      if (disposed) {
        return;
      }

      end();
      const controller = new AbortController();
      active = controller;
      const { signal } = controller;
      const run: Run<S> = {
        signal,
        set: (next: S | ((previous: S) => S)) => {
          if (!signal.aborted) {
            store.set(next);
          }
        },
        ifCurrent: (step: () => void) => {
          if (!signal.aborted) {
            step();
          }
        },
      };
      void spawn(() => {
        return body(run);
      }, reportAsync);
    },
    end,
    dispose: () => {
      disposed = true;
      end();
    },
    isDisposed: () => {
      return disposed;
    },
  };
}
```

Export `createRunSlot`, `type Run`, `type RunSlot` from `src/index.ts` beside the other kernel exports. Run the slot tests — PASS.

- [ ] **Step 3: Move the four machines onto it.** The transformation is the same in each: delete `let active`, `let disposed`, `endActive()` and any local `start()`; `const slot = createRunSlot(store);`; every run function takes `run: Run<State>` where it took `signal: AbortSignal`, passes `run.signal` to `once`/`sleep`, and writes through `run.set(...)`; intents test `slot.isDisposed()` where they tested `disposed`; `dispose` is `slot.dispose()`. Worked example — `rfqSubmission.ts`'s body becomes:

```ts
  const store = createStore<RfqSubmissionState>(EDITING);
  const slot = createRunSlot(store);

  async function submitRfq(
    input: CreateRfqInput,
    onRedirect: (rfqId: number) => void,
    run: Run<RfqSubmissionState>,
  ): Promise<void> {
    run.set(SUBMITTING);
    let rfqId: number;

    try {
      rfqId = await once(deps.createRfq(input), run.signal);
    } catch (error) {
      if (error instanceof AbortError) {
        throw error;
      }

      run.set(EDITING);
      return;
    }

    run.set({ status: "confirmed", rfqId });
    await sleep(RFQ_REDIRECT_DELAY_MS, run.signal);
    // Through the run, like a write: a consumer that disposes INSIDE the
    // callback aborts this run, and the trailing `editing` is then dropped —
    // the machine stays `confirmed`, as the Effect twin does (slice 3 R11).
    run.ifCurrent(() => {
      onRedirect(rfqId);
    });
    run.set(EDITING);
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => {
        slot.start((run) => {
          return submitRfq(input, onRedirect, run);
        });
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
```

Per-machine notes:
  - `tileExecution.ts`: the forked too-long `sleep(...).then(...)` writes through `run.set((current) => …)`; `dismiss` is `if (slot.isDisposed()) { return; } slot.end(); store.set(READY_TILE_EXECUTION);` — a `dismiss` is not a run, so it writes the store directly. Keep the long comment about `TOO_LONG_THRESHOLD_MS < CONFIRMATION_DISMISS_MS`.
  - `rfqTile.ts`: `holdRejected(run)` and `runQuote(run)`; `requestQuote`/`reject` call `slot.start(runQuote)` / `slot.start(holdRejected)`; `cancel`/`accept` are `slot.end(); store.set(INIT);`; every intent keeps its `!slot.isDisposed() && store.get().status === …` guard.
  - `ticketSubmission.ts`: `runCommand(command)` is `slot.start(async (run) => { try { await once(command, run.signal); } catch (error) { …; run.set(NOT_SUBMITTED); return; } run.set(SUBMITTED); });` — the `disposed` early return goes (the slot refuses).
  - `rfqCountdown.ts` and `staleFlag.ts` have no supersession — leave them alone.

- [ ] **Step 4: Run.** `pnpm --filter @rtc/client-core-async exec vitest run` — every existing machine test and the contract runner (`src/coreContract.test.ts`) green with no test edited. Then `pnpm --filter @rtc/client-core-async test:coverage` — still ≥95/85.

- [ ] **Step 5: Commit**

```bash
git add packages/client-core-async
git commit -m "refactor(client-core-async): createRunSlot — one guarded live run per machine; closes the post-await stale-write window" -- packages/client-core-async
```

### Task 5: `createRunSlot` in the Effect core

**Files:**
- Create: `packages/client-core-effect/src/machines/runSlot.ts`, `packages/client-core-effect/src/machines/runSlot.test.ts`
- Modify: `packages/client-core-effect/src/machines/{tileExecution,rfqTile,rfqSubmission,ticketSubmission}.ts`, `packages/client-core-effect/src/index.ts`

**Interfaces:**
- Produces (Task 7's `orderTicket` uses it):

```ts
export interface Run<S> {
  /** `setRefIfChanged`, skipped once this run is no longer the live one. */
  write(next: (current: S) => S): Effect.Effect<void>;
  /** `step`, skipped once this run is no longer the live one — for an
   * effect the world can see that is not a state write. */
  guarded(step: Effect.Effect<void>): Effect.Effect<void>;
}

export interface RunSlot<S> {
  start(build: (run: Run<S>) => Effect.Effect<void, unknown>): void;
  end(): void;
  /** End the run in flight, refuse every later `start`, and close the
   * host's scope. Idempotent. */
  dispose(): void;
  isDisposed(): boolean;
}

export function createRunSlot<S>(
  host: EffectHost,
  ref: SubscriptionRef.SubscriptionRef<S>,
): RunSlot<S>;
```

- [ ] **Step 1: Failing tests.** `runSlot.test.ts`, over `createDetachedHost()` and a `SubscriptionRef`: `start` forks the build and `write` updates the ref; a second `start` interrupts the first fiber (a finalizer on it runs) and the first run's later `write`/`guarded` are skipped — drive it with `Effect.sleep` under `vi.useFakeTimers()` as `rfqSubmission.test.ts` does; `end()`; `dispose()` interrupts, closes the scope (a finalizer added to `host.scope` runs), refuses `start`, is idempotent; a failing build is rethrown out of band (`reportOutOfBand`), an interrupted one is silent. Run — FAIL.

- [ ] **Step 2: The slot.** `packages/client-core-effect/src/machines/runSlot.ts`:

```ts
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Scope,
  type SubscriptionRef,
} from "effect";

import {
  type EffectHost,
  reportOutOfBand,
  setRefIfChanged,
} from "#/bridge/out";

// `Run<S>` and `RunSlot<S>` exactly as in the Interfaces block above.

/** "At most one live run" for a ref-backed machine. `start` interrupts the
 * run in flight and forks the next; the run reaches the world only through
 * its `Run`, whose `write`/`guarded` check the run TOKEN first —
 * interruption lands at a fiber's next suspension, not at the
 * `Fiber.interrupt` call, so a run superseded a fiber-step ago must not be
 * able to write over, or act on behalf of, its successor (slice 3 R10: the
 * invariant rests on the token this slot owns, not on when Effect chooses to
 * deliver an interrupt). A failing build is rethrown out of band: a ref has
 * no error channel (slice 2 ruling 8). */
export function createRunSlot<S>(
  host: EffectHost,
  ref: SubscriptionRef.SubscriptionRef<S>,
): RunSlot<S> {
  let active: object | null = null;
  let activeFiber: Fiber.RuntimeFiber<void> | null = null;
  let disposed = false;

  function end(): void {
    active = null;

    if (activeFiber !== null) {
      Effect.runFork(Fiber.interrupt(activeFiber));
      activeFiber = null;
    }
  }

  return {
    start: (build: (run: Run<S>) => Effect.Effect<void, unknown>) => {
      if (disposed) {
        return;
      }

      end();
      const token = {};
      active = token;

      function guarded(step: Effect.Effect<void>): Effect.Effect<void> {
        return Effect.suspend(() => {
          return active === token ? step : Effect.void;
        });
      }

      const run: Run<S> = {
        guarded,
        write: (next: (current: S) => S) => {
          return guarded(setRefIfChanged(ref, next));
        },
      };
      activeFiber = host.runtime.runFork(
        build(run).pipe(
          Effect.catchAllCause((cause) => {
            return Effect.sync(() => {
              if (!Cause.isInterruptedOnly(cause)) {
                reportOutOfBand(cause);
              }
            });
          }),
        ),
        { scope: host.scope },
      );
    },
    end,
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      end();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
    isDisposed: () => {
      return disposed;
    },
  };
}
```

Export `createRunSlot`, `type Run`, `type RunSlot` from `src/index.ts`. Run the slot tests — PASS.

- [ ] **Step 3: Move the four machines onto it.** Delete `active`, `activeFiber`, `disposed`, `endActive()`, each local `start()` and each local `write`/`Guarded`; `const slot = createRunSlot(host, ref);`; run builders take `run: Run<State>` and use `run.write(() => NEXT)` / `run.guarded(Effect.sync(() => { onRedirect(rfqId); }))`; intents test `slot.isDisposed()`; `dispose` is `slot.dispose()` (it closes the scope — remove the machine's own `Scope.close`). `tileExecution`'s forked too-long child writes through `run.write((current) => …)`; its `dismiss` and `rfqTile`'s `reset()` stay `slot.end()` + a direct `host.runtime.runSync(setRefIfChanged(ref, …))`. **Keep `rfqSubmission.ts`'s MEASURED comment** about the redirect guard verbatim above the `run.guarded(...)` call. One behavioural nuance to preserve: the machines' builds never fail today (`Effect.either`, `catchAll`, `matchEffect` absorb the RPC failure), so the slot's out-of-band rethrow is new but unreachable for them.

- [ ] **Step 4: Run.** `pnpm --filter @rtc/client-core-effect exec vitest run` — every existing test and the contract runner green with no test edited; `pnpm --filter @rtc/client-core-effect test:coverage` ≥95/85.

- [ ] **Step 5: Commit, then ship PR R**

```bash
git add packages/client-core-effect
git commit -m "refactor(client-core-effect): createRunSlot — the run token and the fiber in one place" -- packages/client-core-effect
```

Controller: `/rtc:gauntlet full` on the branch; final whole-branch review; push, open PR R ("refactor(pluggable-core): createRunSlot in both alternative cores — slice-3 residual"), loop CI on `headSha`, CodeQL, merge `--merge`, confirm ancestor, save the ledger, remove the worktree and branch. If PR A merged first and touched neither sibling's `machines/`, merge as-is (the only shared files are the two `coreContract.test.ts` runners, which PR R does not touch).

---

## PR B — the ports

A fresh worktree (`slice-4-b`) off the `main` that contains PR A and PR R. The controller runs `pnpm build` once, confirms `pnpm check:dist`, then dispatches Tasks 6 and 7 in parallel; implementers run `vitest` only and commit by pathspec.

### Task 6: The async core

**Files:**
- Modify: `packages/client-core-async/src/bridge/out.ts` (+ `out.test.ts`), `src/presenters/warmSingletons.ts` (+ test), `src/composition.ts`, `src/composition.machineFactories.test.ts`, `src/parity.json`, `src/index.ts`, `README.md`
- Create: `src/presenters/keyedPortStreams.ts`, `src/presenters/watchlist.ts`, `src/presenters/depth.ts`, `src/presenters/ordersBlotter.ts`, `src/presenters/candleSeries.ts`, `src/machines/eqWorkspace.ts`, `src/machines/eqDrawings.ts`, `src/machines/orderTicket.ts`, `src/composition.seams.test.ts`, and a `.test.ts` beside each new file

**Interfaces:**
- Consumes: Task 1's folds and `CoreSeams`; Task 4's `createRunSlot`; `@rtc/core-contract`'s suites through `src/coreContract.test.ts`.
- Produces: `portCallToStream<T>(open: () => Stream<T>, onValue?: (value: T) => void): Stream<T>`; `storeToWarmStateStream<S>(store: Store<S>): WarmStateStream<S>` with `interface WarmStateStream<S> { readonly state$: StateStream<S>; release(): void }`; `createKeyedPortStreams<T>(open: (key: string) => Stream<T>): (key: string) => Stream<T>`; `createWatchlistPresenter(marketData, lifetime)`, `createDepthPresenter(marketData)`, `createPositionsPresenter(positions, lifetime)`, `createOrdersBlotterPresenter(orders, lifetime)`, `createCandleSeriesPresenter(marketData, lifetime, now?)`; `createEqWorkspaceMachine(deps: EqWorkspaceDeps, lifetime: AbortSignal)` with `interface EqWorkspaceDeps { readonly initialSymbol: string; readonly watchlist$?: Stream<readonly EquityInstrument[]> }`; `createEqDrawingsMachine(lifetime: AbortSignal)`; `createOrderTicketMachine(deps: OrderTicketDeps)` with `interface OrderTicketDeps { place: (req: PlaceOrderRequest) => Stream<EquityOrder>; defaultSymbol: string }`.

- [ ] **Step 1: Two bridge exports, tests first.** Add to `bridge/out.test.ts`:
  - `portCallToStream`: `open` is NOT called until subscribed, and is called once per subscription; every value reaches `onValue` BEFORE the subscriber; source completion completes; a source error errors; an unsubscribe releases the source (`subject.observed` false) and a late `complete` after it does not reach the subscriber.
  - `storeToWarmStateStream`: with zero external subscribers, a `store.set` is what `state$.getValue()` returns; after `release()` a cold `getValue()` is no longer guaranteed current (assert only that `release()` is idempotent and a fresh subscription still yields the current value synchronously).

Then in `bridge/out.ts` (`relay` comes from `#/bridge/in`, which this file already imports a type from):

```ts
/** A per-call, multi-value port stream as a Stream — the lifecycle twin of
 * `promiseToStream`: `open` runs on each subscribe (lazy; two subscribers
 * are two port calls, as with the RxJS core's bare port Observable), every
 * value goes through `onValue` first, completion and errors pass through,
 * and an unsubscribe releases the port. */
export function portCallToStream<T>(
  open: () => Stream<T>,
  onValue: (value: T) => void = () => {},
): Stream<T> {
  return new Observable<T>((subscriber) => {
    const controller = new AbortController();
    relay(open(), controller.signal, (value) => {
      onValue(value);
      subscriber.next(value);
    }).then(
      () => {
        // `relay` also resolves on abort — that is an unsubscribe, not an end.
        if (!controller.signal.aborted) {
          subscriber.complete();
        }
      },
      (error: unknown) => {
        subscriber.error(error);
      },
    );

    return () => {
      controller.abort();
    };
  });
}

/** A `StateStream` and the release of its keep-warm. */
export interface WarmStateStream<S> {
  readonly state$: StateStream<S>;
  release(): void;
}

/** `storeToStateStream` held warm by a subscription of its own, for an
 * app-lifetime singleton: `@rx-state/core` drops a `StateObservable`'s
 * current value at refCount 0, so a cold `getValue()` — what React's
 * `useStateObservable` reads on a first render — would hand back the
 * construction-time default however far the store has moved. The RxJS
 * singletons hold the same internal subscription for the same reason. The
 * `.subscribe()` lives here because the bridge owns rxjs. */
export function storeToWarmStateStream<S>(store: Store<S>): WarmStateStream<S> {
  const state$ = storeToStateStream(store);
  const warm = state$.subscribe();

  return {
    state$,
    release: () => {
      warm.unsubscribe();
    },
  };
}
```

- [ ] **Step 2: The keyed and retained presenters.** `presenters/keyedPortStreams.ts`:

```ts
import type { Stream } from "@rtc/core-api";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";

/** Per-key port streams, memoised: `open(key)` is called once, at the first
 * request for that key, and the result is a replay-1 Topic that subscribes
 * the port on its first subscriber and RELEASES it on its last — a
 * per-symbol stream is refcounted on the server, so it must let go when its
 * symbol is deselected (`warmReplay`'s own rule). */
export function createKeyedPortStreams<T>(
  open: (key: string) => Stream<T>,
): (key: string) => Stream<T> {
  const cache = new Map<string, Stream<T>>();

  return (key: string) => {
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const stream = topicToStream(topicFromObservable(open(key)));
    cache.set(key, stream);
    return stream;
  };
}
```

`presenters/watchlist.ts`:

```ts
/** The roster is the retained singleton (`marketData.watchlist()` called
 * ONCE, here, held until `lifetime` aborts); quotes are per-symbol. */
export function createWatchlistPresenter(
  marketData: MarketDataPort,
  lifetime: AbortSignal,
): WatchlistPresenter {
  const roster = topicFromObservable(marketData.watchlist(), lifetime);

  return {
    watchlist$: topicToStream(roster),
    quote$: createKeyedPortStreams((symbol: string) => {
      return marketData.quotes(symbol);
    }),
  };
}
```

`presenters/depth.ts`: `createDepthPresenter(marketData)` returning `{ depth$: createKeyedPortStreams((symbol) => marketData.depth(symbol)) }` (block-bodied). `warmSingletons.ts`: `createPositionsPresenter(positions: PositionPort, lifetime)` returning `{ positions$: topicToStream(topicFromObservable(positions.positions(), lifetime)) }`, with the file's existing doc style.

Unit tests (the contract covers behaviour; these cover release): `keyedPortStreams.test.ts` — `open` called once per key across two requests and two warm periods; the port is released on the last unsubscribe. `watchlist.test.ts` — `lifetime.abort()` releases the roster's port subscription.

- [ ] **Step 3: `presenters/ordersBlotter.ts`**

```ts
import type {
  EquityFillSignal,
  OrdersBlotterPresenter,
} from "@rtc/core-api";
import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";

import { once } from "#/bridge/in";
import { portCallToStream, topicToStream } from "#/bridge/out";
import { createTopic } from "#/kernel/topic";
import { spawn } from "#/kernel/spawn";
import { untilAborted } from "#/kernel/untilAborted";

/** `fills$` and the refresh signal are hot with no replay — Topics whose
 * producer has no work of its own (slice 2's `executions$`). `orders$` is
 * the retained book: its producer queries `orders()` at once and again on
 * every refresh, the newest query winning (the RxJS `switchMap`), and takes
 * each query's FIRST value — `orders()` is a one-shot snapshot by its own
 * doc (slice 4 ruling 9). A refresh published while nobody has ever
 * subscribed `orders$` reaches nobody, as it reaches nobody on the RxJS
 * `Subject`; the first subscriber queries fresh anyway. `place()` is the
 * port's lifecycle stream, per call, lazily, tapping each update. */
export function createOrdersBlotterPresenter(
  orders: OrderPort,
  lifetime: AbortSignal,
): OrdersBlotterPresenter {
  const fills = createTopic<EquityFillSignal>((signal) => {
    return untilAborted(signal);
  });
  const refreshes = createTopic<void>((signal) => {
    return untilAborted(signal);
  });

  const book = createTopic<readonly EquityOrder[]>(
    (signal, publish) => {
      return new Promise<void>((resolve, reject) => {
        let query: AbortController | null = null;

        function queryBook(): void {
          query?.abort();
          const current = new AbortController();
          query = current;
          void spawn(async () => {
            publish(await once(orders.orders(), current.signal));
          }, reject);
        }

        const stopRefreshes = refreshes.subscribe(queryBook);
        signal.addEventListener(
          "abort",
          () => {
            query?.abort();
            stopRefreshes();
            resolve();
          },
          { once: true },
        );
        queryBook();
      });
    },
    { replay: true, retainUntil: lifetime },
  );

  return {
    fills$: topicToStream(fills),
    orders$: topicToStream(book),
    place: (req: PlaceOrderRequest) => {
      return portCallToStream(
        () => {
          return orders.place(req);
        },
        (order: EquityOrder) => {
          refreshes.publish();

          if (order.status === "filled") {
            fills.publish({ symbol: order.symbol });
          }
        },
      );
    },
  };
}
```

(`Topic.publish` takes a value; for `Topic<void>` call `refreshes.publish(undefined)` if the compiler asks.) Unit tests: a failing `orders()` query fails `orders$`'s subscribers; a refresh arriving while a query is pending aborts it (script `orders()` with a `Subject` and check `observed`); `lifetime.abort()` ends the book's run; `place` twice is two port calls.

- [ ] **Step 4: `presenters/candleSeries.ts`**

```ts
import { stitchCandles } from "@rtc/client-core";
import type { CandleSeriesPresenter, Stream } from "@rtc/core-api";
import {
  CANDLE_HISTORY_PAGE,
  CANDLE_HISTORY_RETRY_COOLDOWN_MS,
  type Candle,
  type CandleTimeframe,
  type MarketDataPort,
} from "@rtc/domain";

import { once, relay } from "#/bridge/in";
import { storeToStateStream, topicToStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
import { createStore, type Store } from "#/kernel/store";
import { createTopic } from "#/kernel/topic";

const DEFAULT_TIMEFRAME: CandleTimeframe = "1D";

/** Per-(symbol|timeframe) backfill state. Everything but the two flags is
 * plain mutable state the key's producer and `loadOlder` share. */
interface Backfill {
  readonly loading: Store<boolean>;
  readonly exhausted: Store<boolean>;
  older: readonly Candle[];
  /** The live base series of the CURRENT warm period; null between periods. */
  base: readonly Candle[] | null;
  /** First candle of the latest stitched emission — the next page's anchor. */
  latestFirst: Candle | null;
  inFlight: boolean;
  lastErrorAtMs: number | null;
  /** The current period's publish; a superseded period's is inert. */
  publish: ((series: readonly Candle[]) => void) | null;
}

/** The RxJS presenter's semantics on Topics and Stores (slice 4 ruling 11):
 * a refCounted, replay-1 series per key that stitches the prepended pages
 * ahead of the live base (`stitchCandles`, imported); a fresh warm period
 * RESETS the key's backfill, because the base regenerates from a new "now";
 * `loadOlder` is single-flight, anchored at the series' first candle,
 * latches exhaustion on a short page and backs off for
 * `CANDLE_HISTORY_RETRY_COOLDOWN_MS` after a failure. An in-flight page is
 * not cancelled by its period ending — only by `lifetime`. */
export function createCandleSeriesPresenter(
  marketData: MarketDataPort,
  lifetime: AbortSignal,
  now: () => number = Date.now,
): CandleSeriesPresenter {
  const series = new Map<string, Stream<readonly Candle[]>>();
  const backfills = new Map<string, Backfill>();

  function backfillFor(key: string): Backfill {
    const existing = backfills.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const created: Backfill = {
      loading: createStore(false),
      exhausted: createStore(false),
      older: [],
      base: null,
      latestFirst: null,
      inFlight: false,
      lastErrorAtMs: null,
      publish: null,
    };
    backfills.set(key, created);
    return created;
  }

  function publishStitched(state: Backfill): void {
    if (state.base === null || state.publish === null) {
      return;
    }

    const stitched = stitchCandles(state.older, state.base);
    state.latestFirst = stitched[0] ?? null;
    state.publish(stitched);
  }

  function openSeries(
    symbol: string,
    timeframe: CandleTimeframe,
    state: Backfill,
  ): Stream<readonly Candle[]> {
    // An empty symbol is the workspace's transient "nothing selected yet":
    // an empty series, never a port call.
    if (symbol === "") {
      return storeToStateStream(createStore<readonly Candle[]>([]));
    }

    const base$ = marketData.candles(symbol, timeframe);

    return topicToStream(
      createTopic<readonly Candle[]>(
        (signal, publish) => {
          state.older = [];
          state.exhausted.set(false);
          state.latestFirst = null;
          state.base = null;
          state.publish = publish;
          return relay(base$, signal, (base) => {
            state.base = base;
            publishStitched(state);
          });
        },
        { replay: true },
      ),
    );
  }

  async function fetchOlderPage(
    symbol: string,
    timeframe: CandleTimeframe,
    anchor: Candle,
    state: Backfill,
  ): Promise<void> {
    try {
      const page = await once(
        marketData.candleHistory(
          symbol,
          timeframe,
          anchor.time,
          CANDLE_HISTORY_PAGE,
        ),
        lifetime,
      );
      state.lastErrorAtMs = null;

      if (page.length < CANDLE_HISTORY_PAGE) {
        state.exhausted.set(true);
      }

      if (page.length > 0) {
        state.older = [...page, ...state.older];
        publishStitched(state);
      }
    } catch (error) {
      if (error instanceof AbortError) {
        throw error;
      }

      state.lastErrorAtMs = now();
    } finally {
      state.inFlight = false;
      state.loading.set(false);
    }
  }

  return {
    candles$: (symbol: string, timeframe: CandleTimeframe = DEFAULT_TIMEFRAME) => {
      const key = `${symbol}|${timeframe}`;
      const cached = series.get(key);

      if (cached !== undefined) {
        return cached;
      }

      const stream = openSeries(symbol, timeframe, backfillFor(key));
      series.set(key, stream);
      return stream;
    },
    loadOlder: (symbol: string, timeframe: CandleTimeframe = DEFAULT_TIMEFRAME) => {
      const state = backfillFor(`${symbol}|${timeframe}`);
      const anchor = state.latestFirst;

      if (state.inFlight || state.exhausted.get() || anchor === null) {
        return;
      }

      if (
        state.lastErrorAtMs !== null &&
        now() - state.lastErrorAtMs < CANDLE_HISTORY_RETRY_COOLDOWN_MS
      ) {
        return;
      }

      state.inFlight = true;
      state.loading.set(true);
      void spawn(() => {
        return fetchOlderPage(symbol, timeframe, anchor, state);
      }, reportAsync);
    },
    loadingOlder$: (symbol: string, timeframe: CandleTimeframe = DEFAULT_TIMEFRAME) => {
      return storeToStateStream(backfillFor(`${symbol}|${timeframe}`).loading);
    },
    historyExhausted$: (
      symbol: string,
      timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
    ) => {
      return storeToStateStream(backfillFor(`${symbol}|${timeframe}`).exhausted);
    },
  };
}
```

Unit tests: `now` is injectable and the cooldown honours it without fake timers; a page landing after its period ended does not publish (no subscriber, no throw) and the next period starts with `older` reset; `lifetime.abort()` abandons an in-flight page silently; `candles$("")` never calls `marketData.candles`.

- [ ] **Step 5: The three machines.** `machines/eqDrawings.ts`:

```ts
/** The chart-annotation singleton: the imported fold over a Store, warm for
 * the app's lifetime. */
export function createEqDrawingsMachine(
  lifetime: AbortSignal,
): Machine<EqDrawingsState, EqDrawingsIntents> {
  const store = createStore<EqDrawingsState>(INITIAL_EQ_DRAWINGS_STATE);
  const warm = storeToWarmStateStream(store);
  let disposed = false;

  function apply(event: EqDrawingsEvent): void {
    if (!disposed) {
      store.set((state) => {
        return reduceEqDrawings(state, event);
      });
    }
  }

  function dispose(): void {
    disposed = true;
    warm.release();
  }

  lifetime.addEventListener("abort", dispose, { once: true });

  return {
    state$: warm.state$,
    intents: {
      setTool: (tool: EqDrawTool) => {
        apply({ kind: "setTool", tool });
      },
      addDrawing: (sym: string, drawing: EqDrawing) => {
        apply({ kind: "addDrawing", sym, drawing });
      },
      updateDrawing: (sym: string, drawing: EqDrawing) => {
        apply({ kind: "updateDrawing", sym, drawing });
      },
      selectDrawing: (id: string | null) => {
        apply({ kind: "selectDrawing", id });
      },
      deleteSelected: (sym: string) => {
        apply({ kind: "deleteSelected", sym });
      },
      shiftAnchors: (sym: string, by: number) => {
        apply({ kind: "shiftAnchors", sym, by });
      },
    },
    dispose,
  };
}
```

`machines/eqWorkspace.ts` — the same shape over `reduceEqWorkspace` / `createEqWorkspaceState(deps.initialSymbol)`, the eight intents mapped to their events (`setTimeframe: (tf) => apply({ kind: "setTimeframe", timeframe: tf })`, `setChartType: (kind) => apply({ kind: "setChartType", chartType: kind })`), plus the seed:

```ts
  const seeding = new AbortController();

  // ONE relay, kept for the machine's lifetime, guarded by a flag: aborting
  // from inside the callback would strand the subscription when the first
  // roster arrives synchronously (relay registers its abort listener after
  // `subscribe` returns). The fold's own guard makes a user selection win.
  if (deps.watchlist$ !== undefined) {
    let seeded = false;
    void spawn(() => {
      return relay(deps.watchlist$ as Stream<readonly EquityInstrument[]>, seeding.signal, (list) => {
        const sym = firstWatchlistSymbol(list);

        if (!seeded && sym !== "") {
          seeded = true;
          apply({ kind: "seed", sym });
        }
      });
    }, reportAsync);
  }
```

(hoist `deps.watchlist$` into a `const` so no cast is needed) and `dispose` also calls `seeding.abort()`.

`machines/orderTicket.ts`:

```ts
export interface OrderTicketDeps {
  place: (req: PlaceOrderRequest) => Stream<EquityOrder>;
  defaultSymbol: string;
}

/** The ticket on a Store and a run slot. The form is plain mutable state;
 * every candidate state goes through the imported `reduceOrderTicket`, so
 * the in-flight gate is the RxJS core's own rule. A valid `submit()`
 * supersedes the order in flight; an invalid one ends it too (the RxJS
 * `switchMap` switches to the error). A failing `place()` has no channel on
 * a Store: it is rethrown on a macrotask and the ticket stays `submitting`
 * (slice 2 ruling 8; slice 4 ruling 12). */
export function createOrderTicketMachine(
  deps: OrderTicketDeps,
): Machine<OrderTicketState, OrderTicketIntents> {
  let form = createOrderTicketForm(deps.defaultSymbol);
  let acc = createOrderTicketAcc(form);
  const store = createStore<OrderTicketState>(acc.state);
  const slot = createRunSlot(store);

  function offer(next: OrderTicketState): void {
    acc = reduceOrderTicket(acc, next);
    store.set(acc.state);
  }

  function patch(change: Partial<OrderTicketForm>): void {
    if (slot.isDisposed()) {
      return;
    }

    form = { ...form, ...change };
    offer({ phase: "editing", form, error: null });
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      setSymbol: (symbol: string) => {
        patch({ symbol });
      },
      setSide: (side: OrderSide) => {
        patch({ side });
      },
      setType: (type: OrderType) => {
        patch({ type });
      },
      setQty: (qty: number) => {
        patch({ qty });
      },
      setLimitPrice: (limitPrice: number | undefined) => {
        patch({ limitPrice });
      },
      reset: () => {
        patch(createOrderTicketForm(deps.defaultSymbol));
      },
      submit: () => {
        if (slot.isDisposed()) {
          return;
        }

        const error = validateOrderTicket(form);

        if (error !== null) {
          slot.end();
          offer({ phase: "editing", form: { ...form }, error });
          return;
        }

        const request = toPlaceOrderRequest(form);
        slot.start(async (run) => {
          run.ifCurrent(() => {
            offer({ phase: "submitting" });
          });
          await relay(deps.place(request), run.signal, (order) => {
            run.ifCurrent(() => {
              offer(orderToTicketPhase(order));
            });
          });
        });
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
```

Note `reset`: a patch of the whole default form REPLACES every field including `limitPrice` only if the default carries the key — `createOrderTicketForm` has no `limitPrice`, and the RxJS `scan` spreads the same object, so a stale `limitPrice` survives a reset in the RxJS core too. Keep parity (spread), and record it in the ledger as an observed RxJS quirk rather than fixing one core.

Unit tests: `eqWorkspace` — a synchronously-arriving roster seeds without stranding the relay (after `dispose()` the scripted `Subject` is unobserved); an intent after `dispose()` is ignored; `lifetime.abort()` disposes. `orderTicket` — a failing `place()` is reported out of band and the state stays `submitting`; a superseded run's late update is ignored.

- [ ] **Step 6: Composition — native first, seams to the base.** In `composition.ts`: `nativePresenters` gains (hoist `watchlist`)

```ts
  const watchlist = createWatchlistPresenter(ports.marketData, lifetime);
  const ordersBlotter = createOrdersBlotterPresenter(ports.orders, lifetime);
  const eqWorkspace = createEqWorkspaceMachine(
    {
      initialSymbol: firstWatchlistSymbol(peek(watchlist.watchlist$, [])),
      watchlist$: watchlist.watchlist$,
    },
    lifetime,
  );
```

and the entries `watchlist`, `candleSeries: createCandleSeriesPresenter(ports.marketData, lifetime)`, `depth: createDepthPresenter(ports.marketData)`, `ordersBlotter`, `positions: createPositionsPresenter(ports.positions, lifetime)`, `eqWorkspace`, `eqDrawings: createEqDrawingsMachine(lifetime)`. Its return type becomes `NativePresenters` — `type NativePresenters = Partial<Presenters> & Pick<Presenters, "eqWorkspace" | "ordersBlotter">;` — so the seams are typed without a non-null assertion. `composeWithBase`:

```ts
  const lifetime = new AbortController();
  // Native FIRST: the base app's Jarvis driver and animation director are
  // pointed at this core's own workspace and fills (`CoreSeams`) — without
  // that a drive batch would mutate a workspace the UI no longer renders.
  const native = nativePresenters(ports, lifetime.signal);
  const base = createRxjsApp(ports, {
    eqWorkspace: native.eqWorkspace,
    equityFills$: native.ordersBlotter.fills$,
  });
```

(`peek` comes from `#/bridge/in`; `firstWatchlistSymbol` from `@rtc/client-core`.) Update the `nativePresenters` doc ("slice 4: the five equities presenters — `watchlist`, `orders$` and `positions` retained — and the two workspace singletons"). `nativeMachines` gains

```ts
    orderTicket: (defaultSymbol: string) => {
      return createOrderTicketMachine({
        place: (req: PlaceOrderRequest) => {
          return presenters.ordersBlotter.place(req);
        },
        defaultSymbol,
      });
    },
```

Tests: `composition.machineFactories.test.ts` gains `"orderTicket reaches ordersBlotter.place lazily — not at construction"` (the `rfqTile` case's shape). New `composition.seams.test.ts`: compose with simulator ports and a `jarvis` port that replies with an `eqSelect` batch (Task 1's `createSelectingJarvisPort`, copied — test files may not import across packages' test trees); after the drive, `composed.app.presenters.eqWorkspace` shows the symbol and `composed.base.presenters.eqWorkspace` does not; and the base `animationDirector.intentsFor("ticket:AAPL")` hears a fill placed through the NATIVE `ordersBlotter.place` (drive the simulator order to `filled`, or script `ports.orders` with a `Subject`).

- [ ] **Step 7: Manifest, exports, README.** `parity.json`: the seven presenters and `orderTicket` → `"native"`. `index.ts`: export every new factory, `portCallToStream`, `storeToWarmStateStream`, `type WarmStateStream`, `createKeyedPortStreams`. `README.md`: "Slice 4: forty-four members native" and a sentence per new idea (keyed refCounted streams; the warm singleton; native-first composition and the seam).

- [ ] **Step 8: Run and commit.** `pnpm --filter @rtc/client-core-async exec vitest run` (the contract runner now exercises the eight suites natively) and `pnpm --filter @rtc/client-core-async test:coverage`. A contract case red here and green on RxJS is a port defect unless the ledger rules it an envelope finding.

```bash
git add packages/client-core-async
git commit -m "feat(client-core-async): equities native — watchlist, candleSeries, depth, ordersBlotter, positions, eqWorkspace, eqDrawings, orderTicket; native-first composition with core seams" -- packages/client-core-async
```

### Task 7: The Effect core

**Files:**
- Modify: `packages/client-core-effect/src/bridge/out.ts` (+ `out.test.ts`), `src/presenters/mirrorPort.ts` (+ test), `src/presenters/warmSingletons.ts` (+ test), `src/layers.ts`, `src/layers.test.ts`, `src/composition.ts`, `src/composition.machineFactories.test.ts`, `src/parity.json`, `src/index.ts`, `README.md`
- Create: `src/presenters/watchlist.ts`, `src/presenters/depth.ts`, `src/presenters/ordersBlotter.ts`, `src/presenters/candleSeries.ts`, `src/machines/eqWorkspace.ts`, `src/machines/eqDrawings.ts`, `src/machines/orderTicket.ts`, `src/composition.seams.test.ts`, and a `.test.ts` beside each new file

**Interfaces:**
- Consumes: Task 1's folds and `CoreSeams`; Task 5's `createRunSlot`.
- Produces: `scopedPortStream<T>(open: () => CoreStream<T>): Stream.Stream<T, unknown>`; `createChildHost(parent: EffectHost): EffectHost`; `refToWarmStateStream<S>(host, ref): WarmStateStream<S>` (`interface WarmStateStream<S> { readonly state$: StateStream<S>; release(): void }`); `followPort<T>(host, source: CoreStream<T>): CoreStream<T>`; `createWatchlistPresenter(host, marketData)`, `createDepthPresenter(host, marketData)`, `createPositionsPresenter(host, positions)`, `createOrdersBlotterPresenter(host, orders)`, `createCandleSeriesPresenter(host, marketData, now?)`; `createEqWorkspaceMachine(host, deps)` (same `EqWorkspaceDeps` shape as Task 6), `createEqDrawingsMachine(host)`, `createOrderTicketMachine(deps)` (same `OrderTicketDeps`); tags `WatchlistTag`, `CandleSeriesTag`, `DepthTag`, `OrdersBlotterTag`, `PositionsTag`, `EqWorkspaceTag`, `EqDrawingsTag`.

- [ ] **Step 1: MEASURE, then three bridge exports.** Write the tests first in `bridge/out.test.ts`, because the first export rests on an Effect behaviour this repo has not measured before:
  - `scopedPortStream`: `open` is NOT called when the stream is built, IS called when it is run; values flow in order; source completion ends the stream; interrupting the running fiber unsubscribes the source (`subject.observed` false after a `settle`); a source error fails the stream.
  - `createChildHost`: closing the parent scope closes the child (a finalizer on the child runs); closing the child leaves the parent open; its runner still runs an effect after a `ManagedRuntime` parent has been disposed.
  - `refToWarmStateStream`: with zero external subscribers, a ref write is what `state$.getValue()` returns after a `settle`; `release()` is idempotent.

```ts
/** A per-call, multi-value port stream as an Effect Stream, owned by the
 * stream's own scope: `open()` is called — and the port subscribed — when
 * the stream STARTS (lazy until run; two runs are two port calls), and
 * released when that scope closes, whether the stream ended, failed, or its
 * fiber was interrupted. The lifecycle twin of `rpc`. */
export function scopedPortStream<T>(
  open: () => CoreStream<T>,
): Stream.Stream<T, unknown> {
  return Stream.unwrapScoped(
    Effect.map(Effect.scope, (scope) => {
      return fromObservable(open(), scope);
    }),
  );
}

/** A host for an app-lifetime machine: the DEFAULT runtime as the runner —
 * an intent that arrives after `app.dispose()` must not die on a disposed
 * managed runtime — and a scope forked from the app host's, so
 * `app.dispose()` ends the machine. */
export function createChildHost(parent: EffectHost): EffectHost {
  return {
    runtime: runnerFor(Runtime.defaultRuntime),
    scope: Effect.runSync(
      Scope.fork(parent.scope, ExecutionStrategy.sequential),
    ),
  };
}

/** A `StateStream` and the release of its keep-warm. */
export interface WarmStateStream<S> {
  readonly state$: StateStream<S>;
  release(): void;
}

/** `refToStateStream` held warm by a subscription of its own, for an
 * app-lifetime singleton — see that function's doc: a COLD `getValue()`
 * hands back the construction-time value however stale, and that is what
 * React's `useStateObservable` reads on a first render. The RxJS singletons
 * hold the same internal subscription for the same reason. */
export function refToWarmStateStream<S>(
  host: EffectHost,
  ref: SubscriptionRef.SubscriptionRef<S>,
): WarmStateStream<S> {
  const state$ = refToStateStream(host, ref);
  const warm = state$.subscribe();

  return {
    state$,
    release: () => {
      warm.unsubscribe();
    },
  };
}
```

**If the `scopedPortStream` measurement fails** (e.g. `unwrapScoped` closes its scope before the inner stream is drained on 3.22.2), the fallback is `Stream.acquireRelease` of a child scope (`Scope.fork` of the fiber's scope, closed in the release) flat-mapped into `fromObservable(open(), child)`; rule on it in the ledger and keep the tests as written.

- [ ] **Step 2: `followPort`, and the keyed and retained presenters.** In `presenters/mirrorPort.ts`:

```ts
/** A port stream followed WITHOUT a seed peek: a seedless `sharedFold`
 * whose producer is one `fromPort`. For a keyed wire stream — `mirrorPort`'s
 * `peekCurrent` is a subscribe + unsubscribe, which on a server-refcounted
 * per-symbol stream is subscribe/unsubscribe/subscribe on the wire at the
 * start of every warm period. The price: the first value arrives a fiber
 * hop after subscribe, never in the caller's tick. A late joiner still
 * replays the latest synchronously; equal consecutive values conflate. */
export function followPort<T>(
  host: EffectHost,
  source: CoreStream<T>,
): CoreStream<T> {
  return sharedFold(host, {
    seed: () => {
      return Option.none();
    },
    run: (update: FoldUpdate<T>, fromPort: FromPort) => {
      return fromPort(source).pipe(
        Stream.runForEach((value) => {
          return update(() => {
            return value;
          });
        }),
      );
    },
  });
}
```

`presenters/watchlist.ts`: `watchlist$: mirrorPortAsIs(host, marketData.watchlist(), { retain: true })` (port called ONCE, at construction); `quote$` memoised in a `Map<string, CoreStream<EquityQuote>>`, a miss building `followPort(host, marketData.quotes(symbol))`. `presenters/depth.ts`: the same memo over `marketData.depth(symbol)`. `warmSingletons.ts`: `createPositionsPresenter(host, positions)` → `{ positions$: mirrorPortAsIs(host, positions.positions(), { retain: true }) }`. Unit tests: `followPort` — one port subscription per warm period and none at construction; release on the last unsubscribe; a late joiner replays synchronously.

- [ ] **Step 3: `presenters/ordersBlotter.ts`**

```ts
/** `fills$` and the refresh signal are `PubSub`s (hot, no replay — slice 2's
 * `executions$`: a publish before a subscriber's fiber has subscribed
 * reaches nobody). `orders$` is a RETAINED fold: one query at once and one
 * per refresh, newest wins (`flatMap` with `switch`), each query's first
 * value (`rpc` — slice 4 ruling 9). `place()` is the port's lifecycle
 * stream under its own scope, tapping each update. */
export function createOrdersBlotterPresenter(
  host: EffectHost,
  orders: OrderPort,
): OrdersBlotterPresenter {
  const fills = host.runtime.runSync(PubSub.unbounded<EquityFillSignal>());
  const refreshes = host.runtime.runSync(PubSub.unbounded<void>());

  function recordUpdate(order: EquityOrder): Effect.Effect<void> {
    return PubSub.publish(refreshes, undefined).pipe(
      Effect.andThen(
        order.status === "filled"
          ? PubSub.publish(fills, { symbol: order.symbol })
          : Effect.void,
      ),
      Effect.asVoid,
    );
  }

  return {
    fills$: streamToStream(host, Stream.fromPubSub(fills)),
    orders$: sharedFold<readonly EquityOrder[]>(host, {
      retain: true,
      seed: () => {
        return Option.none();
      },
      run: (update: FoldUpdate<readonly EquityOrder[]>) => {
        // `merge`, not `concat`: the PubSub subscription must exist from
        // the run's first step, not only after the initial query.
        return Stream.merge(
          Stream.make(undefined),
          Stream.fromPubSub(refreshes),
        ).pipe(
          Stream.flatMap(
            () => {
              return Stream.fromEffect(rpc(orders.orders()));
            },
            { switch: true },
          ),
          Stream.runForEach((book) => {
            return update(() => {
              return book;
            });
          }),
        );
      },
    }),
    place: (req: PlaceOrderRequest) => {
      return streamToStream(
        host,
        scopedPortStream(() => {
          return orders.place(req);
        }).pipe(Stream.tap(recordUpdate)),
      );
    },
  };
}
```

Unit tests: a failing `orders()` fails `orders$`'s subscribers; `place` twice is two port calls; an unsubscribe of `place` releases the port.

- [ ] **Step 4: `presenters/candleSeries.ts`.** The same state as Task 6's `Backfill`, with `loading`/`exhausted` as `SubscriptionRef<boolean>` (streams through `refToStateStream`), a per-period nudge queue instead of a `publish` handle, and the fold as the single writer:

```ts
interface Backfill {
  readonly loading: SubscriptionRef.SubscriptionRef<boolean>;
  readonly exhausted: SubscriptionRef.SubscriptionRef<boolean>;
  older: readonly Candle[];
  latestFirst: Candle | null;
  inFlight: boolean;
  lastErrorAtMs: number | null;
  /** The CURRENT warm period's "older changed" queue; a page landing
   * between periods offers to a queue nobody drains, which is inert. */
  nudges: Queue.Queue<void> | null;
}

type SeriesEvent =
  | { readonly kind: "base"; readonly base: readonly Candle[] }
  | { readonly kind: "older" };
```

`openSeries` (non-empty symbol):

```ts
    const base$ = marketData.candles(symbol, timeframe);

    return sharedFold<readonly Candle[]>(host, {
      seed: () => {
        return Option.none();
      },
      run: (update: FoldUpdate<readonly Candle[]>, fromPort: FromPort) => {
        // Plain synchronous code, as in `conflatedFold`: the period resets
        // the key's backfill and owns its port subscription from the moment
        // it starts.
        const nudges = host.runtime.runSync(Queue.unbounded<void>());
        state.older = [];
        state.latestFirst = null;
        state.nudges = nudges;
        host.runtime.runSync(
          setRefIfChanged(state.exhausted, () => {
            return false;
          }),
        );
        const events = Stream.merge(
          fromPort(base$).pipe(
            Stream.map((base): SeriesEvent => {
              return { kind: "base", base };
            }),
          ),
          Stream.fromQueue(nudges).pipe(
            Stream.map((): SeriesEvent => {
              return { kind: "older" };
            }),
          ),
        );
        let current: readonly Candle[] | null = null;

        return Stream.runForEach(events, (event) => {
          if (event.kind === "base") {
            current = event.base;
          }

          if (current === null) {
            return Effect.void;
          }

          const stitched = stitchCandles(state.older, current);
          state.latestFirst = stitched[0] ?? null;
          return update(() => {
            return stitched;
          });
        });
      },
    });
```

The empty symbol is `refToStateStream(host, host.runtime.runSync(SubscriptionRef.make<readonly Candle[]>([])))`. `loadOlder` keeps Task 6's guards verbatim (`host.runtime.runSync(SubscriptionRef.get(state.exhausted))` for the flag), then:

```ts
      state.inFlight = true;
      host.runtime.runFork(
        setRefIfChanged(state.loading, () => {
          return true;
        }).pipe(
          Effect.andThen(
            rpc(
              marketData.candleHistory(
                symbol,
                timeframe,
                anchor.time,
                CANDLE_HISTORY_PAGE,
              ),
            ),
          ),
          Effect.matchEffect({
            onFailure: () => {
              return Effect.sync(() => {
                state.lastErrorAtMs = now();
              });
            },
            onSuccess: (page) => {
              return recordPage(state, page);
            },
          }),
          Effect.ensuring(
            Effect.suspend(() => {
              state.inFlight = false;
              return setRefIfChanged(state.loading, () => {
                return false;
              });
            }),
          ),
        ),
        { scope: host.scope },
      );
```

with

```ts
  function recordPage(
    state: Backfill,
    page: readonly Candle[],
  ): Effect.Effect<void> {
    return Effect.suspend(() => {
      state.lastErrorAtMs = null;

      if (page.length > 0) {
        state.older = [...page, ...state.older];

        if (state.nudges !== null) {
          Queue.unsafeOffer(state.nudges, undefined);
        }
      }

      return page.length < CANDLE_HISTORY_PAGE
        ? setRefIfChanged(state.exhausted, () => {
            return true;
          })
        : Effect.void;
    });
  }
```

`loading` is set `true` inside the forked effect rather than synchronously — the suites read it after a `settle`. Unit tests: the four Task 6 lists, plus "a nudge offered between periods is never stitched into the next one".

- [ ] **Step 5: The three machines.** `machines/eqDrawings.ts`:

```ts
export function createEqDrawingsMachine(
  parent: EffectHost,
): Machine<EqDrawingsState, EqDrawingsIntents> {
  const host = createChildHost(parent);
  const ref = host.runtime.runSync(
    SubscriptionRef.make<EqDrawingsState>(INITIAL_EQ_DRAWINGS_STATE),
  );
  const warm = refToWarmStateStream(host, ref);
  let disposed = false;

  function apply(event: EqDrawingsEvent): void {
    if (!disposed) {
      host.runtime.runSync(
        setRefIfChanged(ref, (state) => {
          return reduceEqDrawings(state, event);
        }),
      );
    }
  }
  // intents exactly as Task 6's; dispose: disposed = true; warm.release();
  // Effect.runFork(Scope.close(host.scope, Exit.void));
```

`machines/eqWorkspace.ts` — the same over `reduceEqWorkspace`, plus the seed, forked into the machine's scope:

```ts
  if (deps.watchlist$ !== undefined) {
    const roster = fromPortIn(host.scope)(deps.watchlist$);
    host.runtime.runFork(
      roster.pipe(
        Stream.map(firstWatchlistSymbol),
        Stream.filter((sym) => {
          return sym !== "";
        }),
        Stream.take(1),
        Stream.runForEach((sym) => {
          return setRefIfChanged(ref, (state) => {
            return reduceEqWorkspace(state, { kind: "seed", sym });
          });
        }),
        Effect.catchAllCause((cause) => {
          return Effect.sync(() => {
            if (!Cause.isInterruptedOnly(cause)) {
              reportOutOfBand(cause);
            }
          });
        }),
      ),
      { scope: host.scope },
    );
  }
```

`machines/orderTicket.ts` — a DETACHED host (per-mount, like `rfqTile`), `createRunSlot(host, ref)`, the form and `acc` as plain mutable state:

```ts
  function offer(next: OrderTicketState): Effect.Effect<void> {
    return Effect.suspend(() => {
      acc = reduceOrderTicket(acc, next);
      const { state } = acc;
      return setRefIfChanged(ref, () => {
        return state;
      });
    });
  }
```

`patch`/`reset`/the invalid-submit branch run `host.runtime.runSync(offer(...))` (after `slot.end()` for the invalid submit); the valid submit is

```ts
        slot.start((run) => {
          return run.guarded(offer({ phase: "submitting" })).pipe(
            Effect.andThen(
              scopedPortStream(() => {
                return deps.place(request);
              }).pipe(
                Stream.runForEach((order) => {
                  return run.guarded(offer(orderToTicketPhase(order)));
                }),
              ),
            ),
          );
        });
```

A failing `place()` fails the build, which the slot rethrows out of band (ruling 12); `dispose` is `slot.dispose()`. Unit tests as Task 6's, plus: `dispose()` closes the detached scope; a superseded run's port subscription is released.

- [ ] **Step 6: Layers.** Seven tags (`Context.GenericTag<WatchlistPresenter>("@rtc/client-core-effect/watchlist")`, …, `EqWorkspaceTag = Context.GenericTag<Machine<EqWorkspaceState, EqWorkspaceIntents>>("@rtc/client-core-effect/eqWorkspace")`, `EqDrawingsTag` likewise); `NativeServices` gains the seven service types; six `presenterLayer`s (`EqDrawingsLive` ignores `ports`: `presenterLayer(EqDrawingsTag, (host) => createEqDrawingsMachine(host))`, block-bodied); and the dependent one:

```ts
const EqWorkspaceLive: Layer.Layer<
  Machine<EqWorkspaceState, EqWorkspaceIntents>,
  never,
  EffectHost | WatchlistPresenter
> = Layer.effect(
  EqWorkspaceTag,
  Effect.gen(function* buildEqWorkspace() {
    const host = yield* HostTag;
    const watchlist = yield* WatchlistTag;
    return createEqWorkspaceMachine(host, {
      initialSymbol: firstWatchlistSymbol(peek(watchlist.watchlist$, [])),
      watchlist$: watchlist.watchlist$,
    });
  }),
);
```

`buildAppLayer`: the six join `independent`; `dependent` becomes `Layer.mergeAll(PriceStreamLive, PriceHistoryLive, EqWorkspaceLive).pipe(Layer.provide(Layer.merge(PowerSaverLive, WatchlistLive)))` — `WatchlistLive` is both merged into the app and provided to its dependent, memoised by reference, so it is built ONCE (update the doc comment to say so for both). `nativePresentersEffect` gains the seven keys and its type becomes `Effect.Effect<NativePresenters, never, NativeServices>` with `type NativePresenters = Partial<Presenters> & Pick<Presenters, "eqWorkspace" | "ordersBlotter">`. `layers.test.ts`: `toHaveLength(33)`, and a new assertion in the same case — wrap `ports.marketData` so `watchlist()` calls are counted, and expect exactly ONE from building the native graph (the witness that `presenters.watchlist` IS the instance `eqWorkspace` seeded from).

- [ ] **Step 7: Composition — runtime first, seams to the base.**

```ts
  const runtime = ManagedRuntime.make(buildAppLayer(ports));
  const { host, presenters } = runtime.runSync(
    Effect.all({ host: HostTag, presenters: nativePresentersEffect }),
  );
  // Native FIRST (see `CoreSeams`): the base's Jarvis driver and animation
  // director are pointed at this core's own workspace and fills.
  const base = createRxjsApp(ports, {
    eqWorkspace: presenters.eqWorkspace,
    equityFills$: presenters.ordersBlotter.fills$,
  });
```

`nativeMachines` gains `orderTicket` exactly as Task 6 Step 6. Tests: the `composition.machineFactories.test.ts` case and `composition.seams.test.ts`, as Task 6 Step 6 (the Effect versions `await settle()`-equivalent real timeouts where the async ones assert synchronously).

- [ ] **Step 8: Manifest, exports, README, run, commit.** As Task 6 Steps 7–8 for this package (`index.ts` also exports the seven tags, `scopedPortStream`, `createChildHost`, `refToWarmStateStream`, `type WarmStateStream`, `followPort`).

```bash
git add packages/client-core-effect
git commit -m "feat(client-core-effect): equities native — seven layers (eqWorkspace dependent on watchlist), orderTicket on the run slot; runtime-first composition with core seams" -- packages/client-core-effect
```

### Task 8: Docs, status, and the slice gate — then ship PR B

**Files:**
- Modify: `docs/adr/ADR-006-pluggable-application-core.md`, `docs/architecture/22-pluggable-application-core.md`, `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md`, `CLAUDE.md`, `docs/STATUS.md`
- Create: `docs/superpowers/plans/2026-09-21-pluggable-core-slice-4-rulings.md`

- [ ] **Step 1: ADR-006 — "Decided in slice 4"** (date of merge), bullets in the slice-3 style, one per ruling that survived execution: the core seam (`createApp(ports, seams)`) and WHY this slice could not record the coupling as a residual the way slices 2–3 did (an e2e scenario observes it); the four pure folds; the seedable harness; warm singletons contracted through `getValue()`; keyed streams refCounted, `followPort` and its first-value asymmetry; `orders()` as a one-shot; the per-call lifecycle stream and its two bridge exports; `candleSeries`'s reset-per-period and uncancelled page; the `orderTicket` gate as the imported reducer, and the uncontracted failing `place()`; `createRunSlot` and the window it closed; the dependent Layer. Record every asymmetry the runners surfaced.

- [ ] **Step 2: §22** — a sixth bullet under "Warm singletons, conflation and machines": **Keyed streams, lifecycle commands and singletons** (equities), three sentences per core; "The contract tier": thirty-six → forty-four suites' members, the harness seed and the streaming pending queue beside the driver verbs; the parity paragraph ("forty-four members `"native"`"); a short "Core seams" paragraph under the strangler section, with the slice-8 deletion note and the pointer that the slice-2 `AnimationDirector` residual is closable through the same seam.

- [ ] **Step 3: Spec receipt** — after "Slice 3 shipped": `Slice 4 shipped <date> (plan: [`../plans/2026-09-21-pluggable-core-slice-4.md`](../plans/2026-09-21-pluggable-core-slice-4.md)) — suites as PR A, the run slot as PR R, ports as PR B; 44/74 native in both alternative cores; \`createApp\` gained core seams so the base Jarvis driver reaches the native equities workspace.`

- [ ] **Step 4: `CLAUDE.md`** — Current Status ("forty-four members native in both alternative cores as of slice 4 — … the equities presenters (`watchlist`, `candleSeries`, `depth`, `ordersBlotter`, `positions`), the two equities workspace singletons and `orderTicket` —"); the two package rows ("Slice 4: forty-four members native …"); the Application core rule paragraph's count ("forty-four of 74 native as of slice 4") and member list.

- [ ] **Step 5: `docs/STATUS.md`** — the pluggable-core entry: "slice 4 shipped (<date>); next: slice 5 (admin)" — `throughput`, `throughputMetric`, `latencyMetric`, `errorRateMetric`, `topology`, `eventLog`, `sessions`, `sessionsKpi`; machine `incident` ("rolling windows"); add the slice-4 plan + rulings links. REMOVE the two slice-3 residual sentences PR R closed (the run-slot consolidation; the async stale-write window). KEEP the `rfqCountdown` seed-symmetry residual and the slice-2 block. ADD the slice-4 residuals: a failing `place()` leaves the ticket `submitting` in all three cores (a product fix); a stale `limitPrice` survives `reset()` in all three cores; the base app still opens its own `marketData.watchlist()` subscription under an alternative core (its orphaned `eqWorkspace` peeks it) — closed by slice 8; the slice-2 `AnimationDirector` residual is now closable through `CoreSeams`. Bump `Last updated`.

- [ ] **Step 6: Rulings ledger** — `2026-09-21-pluggable-core-slice-4-rulings.md` from the three PRs' SDD ledgers (the slice-3 file is the template: rulings made during execution, up-front rulings that changed shape, implementers' deviations, deferred minors with triage).

- [ ] **Step 7:** `pnpm check:doc-links`.

- [ ] **Step 8: The local CI mirror** — `/rtc:gauntlet full`; `pnpm core:parity` (expect `native: async 44/74, effect 44/74`); `pnpm check:core-bundle` (note the six gzip sizes in the PR body).

- [ ] **Step 9: The e2e matrix — the slice's exit criterion.** `pnpm test:e2e`, `pnpm test:e2e:async`, `pnpm test:e2e:effect`, each run UNPIPED, each invoked with its words passed separately (zsh does not word-split a `$cmd` variable), judged from the full summary. All three green — in particular the Jarvis drive scenario on the async and Effect legs (the seam's witness) and every equities Gherkin scenario (watchlist selection, chart backfill, the order ticket lifecycle, the blotter).

- [ ] **Step 10: Commit and ship PR B**

```bash
git add docs CLAUDE.md
git commit -m "docs(pluggable-core): slice 4 receipts — ADR-006, §22, spec, CLAUDE.md, STATUS to slice 5; rulings ledger" -- docs CLAUDE.md
```

Final whole-branch review (most capable model), one fix wave. Push, open PR B ("feat(pluggable-core): slice 4 PR B — equities native in both cores; parity 44/74"), loop CI on `headSha`, CodeQL, merge `--merge`, confirm ancestor, remove the worktree and branch.

---

## Self-review

**Spec coverage.** Slice table row "4 equities": `watchlist`, `candleSeries`, `depth`, `ordersBlotter`, `positions` (Tasks 3/6/7); machines `eqWorkspace`, `eqDrawings`, `orderTicket` (3/6/7). "The two singletons the World harness instantiates" → `eqWorkspace`/`eqDrawings`, contracted as warm singletons (ruling 6); the World harness itself keeps importing the RxJS factories, whose signatures Task 1 preserves. Exit criterion: suites (3), native in both (6, 7), e2e matrix (8 Step 9), `parity.json` (6, 7). "Pure reducers imported, not duplicated": the four folds (Task 1). Effect Tag/Layer composition: Task 7 Step 6. Contract tier "driver verbs arrive with the slices that assert on them": Task 2. The slice-3 residual STATUS scheduled "before or during slice 4": Tasks 4–5. The strangler seam the spec defers to slices 6–8 is opened early, minimally, because this slice's members make it observable (ruling 2).

**Placeholder scan.** Task 3 Step 2 describes `depth`/`positions` against a fully written sibling in the same task (the two `watchlist` cases whose bodies they reuse, with every name substituted in the text). Tasks 4–5 Step 3 give the slot in full, one fully worked machine, and a per-machine note for the other three — a behaviour-preserving transformation whose witnesses are existing tests that may not be edited. Task 7 Steps 4–5 give the Effect-specific code in full and point at Task 6 for the guards and intent tables that are character-identical. Unit-test lists name each case's arrangement and assertion. No "TBD", no "add error handling".

**Type consistency.** `EqWorkspaceDeps { initialSymbol; watchlist$? }` is the same in Tasks 6 and 7 and differs from the RxJS `EqWorkspaceDeps { initialSymbol; seed$? }` deliberately (a sibling cannot apply `map`/`filter`/`take` outside its bridge; it takes the roster and seeds through `firstWatchlistSymbol`). `OrderTicketDeps.place: (req: PlaceOrderRequest) => Stream<EquityOrder>` matches `OrdersBlotterPresenter.place` in all three cores. `CoreSeams.equityFills$: Observable<EquityFillSignal>` accepts `OrdersBlotterPresenter.fills$` (`Stream` is `Observable`). Driver verbs used by the suites — `emitWatchlist`, `watchlistObserved`, `emitEquityQuote`, `equityQuoteObserved`, `emitCandles`, `candlesObserved`, `pendingCandleHistory`, `resolveCandleHistory`, `failCandleHistory`, `emitDepth`, `depthObserved`, `setOrderBook`, `pendingOrders`, `emitOrderUpdate`, `failOrder`, `emitPositions`, `positionsObserved` — are declared in Task 2 (`completeOrder` is declared and exercised by the harness's own test only). `PortMethodName` strings in `portDiscipline` — `"marketData.watchlist"`, `"positions.positions"` — are the two Task 2 adds. Fixture names match Task 2 Step 3 and the `index.ts` exports. Async `Run<S> { signal, set, ifCurrent }` and Effect `Run<S> { write, guarded }` are used exactly so in Tasks 6 and 7. Counts: 74 members (unchanged); 36 + 8 = 44 native; `PENDING_SUITES` 38 − 8 = 30; Effect layers 26 + 7 = 33.
