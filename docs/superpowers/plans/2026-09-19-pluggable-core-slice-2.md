# Pluggable Application Core — Slice 2 (FX Pricing + Blotter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the six FX pricing/blotter presenters — `priceStream`, `priceHistory`, `currencyPairs`, `blotter`, `analytics`, `execution` — and the five machines — `staleFlag`, `analyticsStaleFlag`, `rowHighlight`, `notional`, `tileExecution` — a behavioural contract suite each (green on the RxJS core first), then a native implementation in both alternative cores, so `pnpm core:parity` reads 28/71 for each core and the Effect core composes its presenters as `Context` services in a `Layer`.

**Architecture:** Two PRs. **PR A (Tasks 1–3, "the RxJS side")** moves the four app-layer timing/cap constants the suites need into `@rtc/domain`, exports the pure folds the RxJS presenters and machines already contain (`blotterFolds`, `staleFlagFold`, `notionalView`, `tileExecutionState`) from `@rtc/client-core` so both siblings drive the SAME reducer under a different runtime, extends the `@rtc/core-contract` harness with scripted FX ports (`pricing`, `referenceData`, `blotter`, `analytics`, `execution` become `Subject`-backed, intent-named driver verbs) and a fake-clock helper, and lands the eleven suites — green on all three runners, meaningfully only on RxJS while the siblings still delegate. **PR B (Tasks 4–6, "the ports")** makes the eleven members native: the async core gains a retained (`warmReplay`) Topic option, a conflating Topic (leading+trailing throttle gated by `powerSaver.isCalm$`), an RPC-to-Stream bridge, `Store`-backed machines, and an app-lifetime `AbortSignal` minted in `composeWithBase`; the Effect core gains `Context.GenericTag` services with a `Layer` per presenter (`AppPorts` enters as `Layer.succeed`, the host as `Layer.scoped`, `createApp` is `ManagedRuntime.make(AppLive)` + ONE `runSync`), a retained `sharedFold`, a conflating fold, `SubscriptionRef`-backed machines each owning a detached scope, and `rpc` promoted to its own bridge file. Task 6 records receipts (ADR-006 "Decided in slice 2", §22, CLAUDE.md, STATUS to slice 3) and runs the gate: gauntlet + the three-leg e2e matrix.

**Tech Stack:** TypeScript 7 `tsc` (6.x API shim for tooling — see `docs/typescript-7.md`), pnpm 12 workspaces + Turborepo (strict env), vitest 4.1 (fake timers via `vi.useFakeTimers` / `vi.advanceTimersByTimeAsync`), RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2 (`Context`, `Layer`, `ManagedRuntime`, `SubscriptionRef`, `PubSub`, `Stream`, `Effect.race`), dependency-cruiser, knip, Playwright.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md) — slice table row "2 FX pricing + blotter"; "The async/await core" (the tile-execution sketch); "The Effect core" (Tag/Layer composition, `Effect.race`, `Fiber.interrupt`); "The core-contract tier" (driver verbs `tickPrice`, `resolveExecution`, `failExecution` "arrive with the slices that assert on them"; "Time is vitest fake timers for all three cores"). Slice 0 shipped as PR #717; slice 1a as #764; slice 1b as #772 (suites #765); the residual sweep as #785 (plan: [`2026-09-19-pluggable-core-residual-sweep.md`](2026-09-19-pluggable-core-residual-sweep.md)) — every primitive this slice builds on (`Topic` reset-on-error, seedless `sharedFold`, `fromPort`, `peek` throwing, port discipline) is as that plan left it.

## Global Constraints

- **Exit criterion (spec, "Slices 1a–7"):** suites for the eleven members exist and are green on RxJS (PR A); both alternative cores have them native (PR B); the e2e matrix (`test:e2e`, `test:e2e:async`, `test:e2e:effect`) is green; `parity.json` updated in both cores (28/71 each).
- **Ordering rule (spec):** a member's suite is green on RxJS before either alternative core ports it. PR A merges before Task 4 or 5 starts; Tasks 4–5 run in a worktree created off the `main` that contains PR A.
- **Bridge rule:** outside `packages/client-core-{async,effect}/src/bridge/`, `rxjs` and `@rx-state/core` are **type-only** imports (dependency-cruiser `bridge-owns-rxjs` + grep gate 43; `.test.ts` exempt). Every new `Observable` construction in this slice lives in a `bridge/` file. `effect` is importable only inside `packages/client-core-effect/` (`effect-only-in-client-core-effect`). Outside `bridge/`, the Effect core reaches `fromObservable` only through a `FromPort` (`effect-port-subscription-owned-by-the-bridge`) — Task 5 adds `fromPortIn(scope)` for machines rather than relaxing the rule.
- **Types-only rule:** `packages/core-api/src` exports no runtime value (grep gate 42). This slice does not touch `core-api`. `@rtc/core-contract` never imports `@rtc/client-core` (build-order cycle) — constants the suites need therefore move to `@rtc/domain` (Task 1), never to `client-core`.
- **Pure reducers are imported from `@rtc/client-core`, never duplicated** (spec, "The async/await core"). Task 1 exports them; Tasks 4–5 import them. A sibling core that re-implements a fold rather than importing it is a review finding.
- **Workspace packages resolve through `dist`** (`exports` → `./dist/index.js`, no vitest alias). After Task 1, run `pnpm --filter @rtc/domain build && pnpm --filter @rtc/client-core build`; after Task 2/3, `pnpm --filter @rtc/core-contract build` — before running any dependent's tests. A stale `dist` gives a false result in either direction. **Parallel implementers on one worktree must not run repo-wide `pnpm build` mid-wave** (a truncated 0-byte `.d.ts` persists through tsbuildinfo and turbo's cache — memory note `parallel-builds-truncate-dist-and-poison-turbo-cache`); build only your own package with `--filter`.
- **Shared dep versions must match the repo exactly** (`pnpm check:versions`). This slice adds no dependency.
- **Coverage gates:** each alternative core's `test:coverage` must stay ≥95% statements/lines/functions and ≥85% branches. The contract runner (`src/coreContract.test.ts`) exercises every member through the eleven suites; unit tests cover what the contract cannot see (port release, `retainUntil`, abort paths, the Layer graph).
- **Biome + ESLint:** mandatory braces on every control statement; arrow functions use block bodies with an explicit `return`; zero findings; no `biome-ignore`/`eslint-disable`. `func-style` forbids `const f = () => {}` and `let f = () => {}` — named functions are `function` declarations; a `let` holder for a later-assigned closure is declared WITHOUT an initializer (the repo's documented workaround). Exported functions carry explicit return types (`nursery/useExplicitType`). No inline object type literal in a return-type or parameter position — name an `interface` (`no-restricted-syntax`). A class must name its file (`rtc/class-filename-match`) — which is why the Effect tags are `Context.GenericTag`, not `class X extends Context.Tag(...)`. Function names state their effect (`rtc/name-functions-by-effect`); fixture factories are `create*` (`rtc/name-fixture-factories`); test files put tests before helpers (`rtc/newspaper-order`).
- `#/` subpath imports only; never `@/`; ≥2-up relative imports are banned.
- **Port discipline (residual sweep):** an app-lifetime port method (`referenceData.getCurrencyPairs`, `blotter.getTradeStream`, `analytics.getAnalytics`) is called once, at construction, in every core; `portDiscipline` gains one constancy case per member. A per-key port method (`pricing.getPriceUpdates(symbol)`) is called per warm period through the domain use case's `defer` — the RxJS core's own shape — and is NOT under the constancy rule.
- **Only the first value is synchronous (slice 1a ruling):** suites assert a subscription's first value in the caller's tick and every later value after `settle()` — or, under the fake clock, after `clock.settle()`. **Never call the real `settle()` while fake timers are installed** (it waits on the real `setTimeout` and hangs).
- **Equal-state conflation stays uncontracted:** an Effect fold drops an `Object.is`-equal consecutive state; the RxJS `scan`/`map` and the async `Topic` re-emit it. No suite asserts a re-emission of an unchanged value (`activity$` with no additions, `staleFlag` re-folding `false`).
- **No new env vars, scripts, packages or CI jobs.** Selection, matrix and gates from slice 0 are reused as-is.
- Commit after every task with the repo's trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH
  ```

## Rulings recorded up front

1. **Two PRs, suites first.** PR A (Tasks 1–3) is the RxJS side and ships alone; PR B (Tasks 4–6) is the port. A reviewer can accept the suites and reject a port, which is the test for a PR boundary; and the ports are then judged against a merged, fixed target — the ordering rule made concrete, exactly as slice 1b's suites shipped as #765 ahead of #772. Cost if wrong: one extra CI cycle.
2. **Four constants move to `@rtc/domain`:** `PRICE_CONFLATION_MS = 250`, `PRICE_HISTORY_CONFLATION_MS = 1_000` (in `fx/price.ts`), `BLOTTER_ROW_HIGHLIGHT_MS = 3_000`, `ACTIVITY_FEED_CAP = 40` (in `fx/trade.ts`, beside `CONFIRMATION_DISMISS_MS` and `REJECTED_DISPLAY_MS`, which already live there). `@rtc/core-contract` may not import `@rtc/client-core`, and a hard-coded `250` in a suite is a number nobody can grep. `client-core` keeps `HIGHLIGHT_MS` and `ACTIVITY_CAP` as aliases of the domain values, so the two web clients' `BlotterRow.tsx` and the React contract harness that import them do not change. Cost if wrong: a rename.
3. **The pure folds are extracted, not rewritten.** `BlotterPresenter`'s two `scan` steps, `StaleFlagMachine`'s reducer, `NotionalMachine`'s view builders and `TileExecutionMachine`'s state helpers move into four exported files; the RxJS classes import them; their existing tests are the witness that behaviour did not move. `reduceActivity` takes `now: number` instead of calling `Date.now()` so the fold is pure and a test can pin the clock. Cost if wrong: none observable — same code, new file.
4. **Scripted FX ports replace the simulators entirely in the harness.** `PricingSimulator` ticks on a random real-time schedule and `AnalyticsSimulator` every 10 s; a suite cannot assert against either. `scriptPorts` swaps the five FX ports for `Subject`-backed ones the driver controls; the runners' base construction does not change. An execution request becomes visible to the driver only when the core SUBSCRIBES the port's stream (a `defer`), so "lazy until subscribed" is a property of the core, not of the harness. Cost if wrong: none — production ports are untouched.
5. **Fake timers live inside the suite, never in the harness.** `withFakeClock(run)` installs `vi.useFakeTimers()` around one `it`, hands a `FakeClock` with `advance(ms)` and `settle()` (two zero-length advances — the fake-clock twin of `settle()`), and restores real timers in `finally`. The harness is created INSIDE the fake clock so no scheduler captures a real timer first. Suites that need no timer keep real `settle()`. Cost if wrong: a suite that hangs, visible immediately.
6. **`retainUntil` is the async core's `warmReplay`; `retain: true` is the Effect core's.** `shareReplay({ refCount: false })` keeps a source subscribed across zero subscribers for the session; neither sibling had a way to say that. The async `Topic` gains `TopicOptions.retainUntil?: AbortSignal` (the run outlives the last unsubscribe until the signal aborts); `composeWithBase` mints the signal and aborts it in `dispose()` BEFORE the base app is disposed (the comment slice 0 left there). The Effect `SharedFold` gains `retain?: boolean` (the last unsubscribe does not end the period; the host scope does). Cost if wrong: one option each; the members that use it are the three warm singletons plus `activity$`.
7. **Conflation is hand-written in both siblings, as the RxJS `conflateWhen` is.** A leading+trailing throttle gated by a boolean with immediate effect is not an off-the-shelf combinator in either runtime (Effect's `Stream.throttle` is a token bucket, `aggregateWithin` trailing-only). Each core writes it once — `createConflatedTopic` (async: a producer with a window `AbortController`) and `conflatedFold` (Effect: a `Ref<ConflationState>` with atomic `Ref.modify` transitions and a forked `Effect.sleep`) — inside the place its runtime allows a timer (a `Topic` producer; a `sharedFold`'s `run`). A flag flip takes effect immediately; a trailing value pending when the flag turns OFF is discarded (the RxJS `switchMap` drops the throttled inner) — the suites assert the flip, not the discard. Values arriving before the flag has emitted are dropped in all three (rxjs has no inner yet). Cost if wrong: contained in one file per core.
8. **Machines own their runtime, not the app.** `createMachineFactories(presenters)` has no app handle (a `CoreFactory` fact, out of scope to change). Async machines are a `Store` plus an `AbortController` aborted by `dispose()`; Effect machines build a **detached host** (`Runtime.defaultRuntime` + a `Scope` of their own, closed by `dispose()`). A machine's source failure has no channel on a `Store`/`SubscriptionRef` (the RxJS `state()` would error `state$`, which nothing observes): it aborts the machine and is rethrown on a macrotask (`reportAsync` / `reportOutOfBand`). Uncontracted. Cost if wrong: a machine that errors `state$` later needs a channel — none does today.
9. **Effect composition goes to `Context.GenericTag` + `Layer` for every native presenter, not only the new six.** Half a Layer graph is worse than none. `services.ts` holds `AppPortsTag`, `HostTag`, `HostLive` (a `Layer.scoped` that captures the runtime and forks a closeable child scope — the `EffectHost` every presenter already takes) and `presenterLayer(tag, build)`; `layers.ts` holds one tag + one `Live` layer per native presenter and `buildAppLayer(ports)`; `composeWithBase` is `ManagedRuntime.make(buildAppLayer(ports))` + one `runSync` resolving `{ host, presenters }`. `PowerSaverLive` is provided to `PriceStreamLive`/`PriceHistoryLive` and merged into the app: the same Layer reference is memoised, so `presenters.powerSaver` IS the instance `priceStream` gates on. `EffectHost.runtime` widens from `ManagedRuntime` to the structural `EffectRunner { runSync, runFork }` (a `ManagedRuntime` still satisfies it, so no existing test changes). Cost if wrong: mechanical — 22 four-line stanzas.
10. **`rpc` moves to `bridge/rpc.ts` and is exported.** The `effect-port-subscription-owned-by-the-bridge` rule confines `bridge/in.ts` because `fromObservable` subscribes EAGERLY; `rpc` is lazy (`Effect.async`) and is exactly the RPC primitive the residual sweep kept for this slice. Moving it out of `in.ts` keeps the rule honest instead of widening it. Cost if wrong: a file move.
11. **A one-shot command result completes.** `execute(input)` returns a stream that emits one `ExecuteTradeResult` and completes in all three cores. Slice 1b's ruling ("completion is not part of the presenter-STREAM envelope") was about `Stream` members that mirror ports; an RPC result is a different shape and its source completes. The suite asserts the value, not the completion. Cost if wrong: none.
12. **A hot no-replay stream (`executions$`) is asserted only after `settle()` following subscribe.** The Effect `PubSub` subscription is taken on the subscriber's fiber, one step after `subscribe()`; a publish in that gap reaches nobody, as it reaches nobody on an RxJS `Subject` with no observer. The suites `await settle()` between subscribing `executions$` and driving. Cost if wrong: none — the promise is "hears what is published while subscribed".
13. **The RxJS core and the harness are the only things PR A changes in production code paths**, and only by moving code: no RxJS behaviour changes. `pnpm --filter @rtc/client-core test` (all 62+ presenter/machine tests) is the witness, alongside the three runners.

## Parallelism (accelerated SDD)

PR A: Task 1 (`domain` + `client-core`) and Task 2 (`core-contract` harness) touch disjoint packages and run as two parallel implementers on one worktree, each committing by pathspec (`git commit -- packages/domain packages/client-core` / `-- packages/core-contract`). Task 3 (suites + registry) follows both, alone; it consumes Task 1's constants and Task 2's driver. Ship PR A.
PR B: Task 4 (async core) and Task 5 (Effect core) touch disjoint packages and run as two parallel implementers on one fresh worktree off the merged `main`, committing by pathspec (`-- packages/client-core-async` / `-- packages/client-core-effect`). Task 6 last, alone. Covering tests only per implementer; one gauntlet per PR (Task 3 Step 12 for PR A; Task 6 for PR B).

---

## File structure

```
PR A ───────────────────────────────────────────────────────────────────────────
packages/domain/                                    MODIFIED (Task 1)
  src/fx/price.ts                                   + PRICE_CONFLATION_MS, PRICE_HISTORY_CONFLATION_MS
  src/fx/trade.ts                                   + BLOTTER_ROW_HIGHLIGHT_MS, ACTIVITY_FEED_CAP
  src/index.ts                                      export the four
packages/client-core/                               MODIFIED (Task 1)
  src/presenters/blotterFolds.ts                    NEW  NewTradeScan/ActivityScan, createNewTradeScan, reduceNewTrades, createActivityScan, reduceActivity, formatClockTime
  src/presenters/staleFlagFold.ts                   NEW  StaleFlagEvent, StaleFlagAcc, createStaleFlagAcc, reduceStaleFlag
  src/presenters/notionalView.ts                    NEW  createInitialNotionalView, reduceNotionalInput, formatWithCommas
  src/presenters/tileExecutionState.ts              NEW  READY_TILE_EXECUTION, STARTED_TILE_EXECUTION, TOO_LONG_TILE_EXECUTION, TIMEOUT_TILE_EXECUTION, TIMED_OUT_TILE_EXECUTION, finishedTileExecution, isTerminalTileExecution
  src/presenters/{BlotterPresenter,StaleFlagMachine,NotionalMachine,TileExecutionMachine,RowHighlightMachine,PriceStreamPresenter,PriceHistoryPresenter}.ts   import the above / the domain constants; behaviour unchanged
  src/presenters/index.ts                           export the four new files
  src/presenters/__tests__/{blotterFolds,staleFlagFold,notionalView,tileExecutionState}.test.ts   NEW  direct reducer tests
packages/core-contract/                             MODIFIED (Task 2)
  src/harness/scriptedPorts.ts                      scripted pricing/referenceData/blotter/analytics/execution; driver verbs; PortMethodName + 3
  src/harness/fixtures.ts                           NEW  createTick, createPrice, createTrade, createPositionUpdates, EURUSD
  src/harness/clock.ts                              NEW  FakeClock, withFakeClock
  src/harness/scriptedPorts.test.ts                 + FX port cases
  src/index.ts                                      export fixtures + clock
packages/core-contract/                             MODIFIED (Task 3)
  src/suites/{priceStream,priceHistory,currencyPairs,blotter,analytics,execution}.ts            NEW
  src/suites/{staleFlag,analyticsStaleFlag,rowHighlight,notional,tileExecution}.ts               NEW
  src/suites/portDiscipline.ts                      + currencyPairs, blotter, analytics constancy cases
  src/registry.ts                                   eleven nulls → suites; PENDING_SUITES −11
  src/registry.test.ts                              + "slice 2 members have suites"
PR B ───────────────────────────────────────────────────────────────────────────
packages/client-core-async/                         MODIFIED (Task 4)
  src/kernel/topic.ts                               TopicOptions.retainUntil; mapTopic over relayTopic
  src/kernel/relayTopic.ts                          NEW  relayTopic(source, signal, next)
  src/bridge/in.ts                                  once(source, signal?); topicFromObservable(source, retainUntil?)
  src/bridge/out.ts                                 topicToStreamWithLead, promiseToStream
  src/presenters/conflatedTopic.ts                  NEW  createConflatedTopic
  src/presenters/priceStream.ts                     NEW  createPriceStreamPresenter
  src/presenters/priceHistory.ts                    NEW  createPriceHistoryPresenter
  src/presenters/warmSingletons.ts                  NEW  createCurrencyPairsPresenter, createAnalyticsPresenter
  src/presenters/blotter.ts                         NEW  createBlotterPresenter
  src/presenters/execution.ts                       NEW  createTradeExecutionPresenter
  src/machines/{notional,rowHighlight,staleFlag,tileExecution}.ts     NEW
  src/composition.ts                                lifetime signal; powerSaver hoisted; nativeMachines(presenters)
  src/composition.machineFactories.test.ts          NEW  wiring table (the RxJS precedent)
  src/parity.json / src/index.ts / README.md
  tests: kernel/topic.test.ts (+retainUntil), kernel/relayTopic.test.ts, bridge/in.test.ts (+once abort), bridge/out.test.ts (+lead, +promiseToStream), presenters/*.test.ts, machines/*.test.ts
packages/client-core-effect/                        MODIFIED (Task 5)
  src/bridge/out.ts                                 EffectRunner, runnerFor, createDetachedHost, setRefIfChanged, fromPortIn, reportOutOfBand, SharedFold.retain
  src/bridge/rpc.ts                                 NEW (moved from in.ts) rpc
  src/services.ts                                   NEW  AppPortsTag, HostTag, HostLive, presenterLayer
  src/layers.ts                                     NEW  22 tags + Live layers, buildAppLayer, nativePresentersEffect
  src/presenters/mirrorPort.ts                      MirrorOptions { retain }
  src/presenters/conflatedFold.ts                   NEW  conflatedFold
  src/presenters/{priceStream,priceHistory,warmSingletons,blotter,execution}.ts   NEW
  src/machines/{notional,rowHighlight,staleFlag,tileExecution}.ts     NEW
  src/composition.ts                                ManagedRuntime.make(buildAppLayer(ports)) + one runSync
  src/composition.machineFactories.test.ts          NEW
  src/parity.json / src/index.ts / README.md
  src/bridge/clock.test.ts                          NEW  measurement gate: Effect.sleep advances under vitest fake timers
  tests: bridge/out.test.ts (+retain, +setRefIfChanged, +fromPortIn, +createDetachedHost, +reportOutOfBand), bridge/rpc.test.ts (moved), services.test.ts, layers.test.ts, presenters/*.test.ts, machines/*.test.ts
docs (Task 6)
  docs/adr/ADR-006-pluggable-application-core.md    "Decided in slice 2"
  docs/architecture/22-pluggable-application-core.md   contract-tier count, parity count, new "Warm singletons, conflation and machines" section
  docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md   receipt line
  CLAUDE.md, docs/STATUS.md                         counts; headline → slice 3
```

---

### Task 1: The RxJS side — four constants to `@rtc/domain`, four pure folds exported from `@rtc/client-core`

**Files:**
- Modify: `packages/domain/src/fx/price.ts` (append after `PRICE_HISTORY_SIZE`)
- Modify: `packages/domain/src/fx/trade.ts` (append after `REJECTED_DISPLAY_MS`)
- Modify: `packages/domain/src/index.ts` (the `./fx/price.js` and `./fx/trade.js` value-export lists, lines ~99–116)
- Create: `packages/client-core/src/presenters/blotterFolds.ts`
- Create: `packages/client-core/src/presenters/staleFlagFold.ts`
- Create: `packages/client-core/src/presenters/notionalView.ts`
- Create: `packages/client-core/src/presenters/tileExecutionState.ts`
- Modify: `packages/client-core/src/presenters/BlotterPresenter.ts`, `StaleFlagMachine.ts`, `NotionalMachine.ts`, `TileExecutionMachine.ts`, `RowHighlightMachine.ts`, `PriceStreamPresenter.ts`, `PriceHistoryPresenter.ts`
- Modify: `packages/client-core/src/presenters/index.ts`
- Test: `packages/client-core/src/presenters/__tests__/blotterFolds.test.ts`, `staleFlagFold.test.ts`, `notionalView.test.ts`, `tileExecutionState.test.ts` (new); every existing test under `__tests__/` unchanged and green

**Interfaces:**
- Consumes: nothing from this plan.
- Produces (imported by Tasks 3, 4, 5):
  - `@rtc/domain`: `PRICE_CONFLATION_MS: 250`, `PRICE_HISTORY_CONFLATION_MS: 1000`, `BLOTTER_ROW_HIGHLIGHT_MS: 3000`, `ACTIVITY_FEED_CAP: 40`.
  - `@rtc/client-core`: `interface NewTradeScan`, `createNewTradeScan(): NewTradeScan`, `reduceNewTrades(acc: NewTradeScan, trades: readonly Trade[]): NewTradeScan`; `interface ActivityScan`, `createActivityScan(): ActivityScan`, `reduceActivity(acc: ActivityScan, trades: readonly Trade[], now: number): ActivityScan`, `formatClockTime(ms: number): string`; `type StaleFlagEvent<T>`, `interface StaleFlagAcc<T>`, `createStaleFlagAcc<T>(): StaleFlagAcc<T>`, `reduceStaleFlag<T>(acc, event): StaleFlagAcc<T>`; `createInitialNotionalView(defaultNotional: number): NotionalView`, `reduceNotionalInput(defaultNotional: number, input: string): NotionalView`; `READY_TILE_EXECUTION`, `STARTED_TILE_EXECUTION`, `TOO_LONG_TILE_EXECUTION`, `TIMEOUT_TILE_EXECUTION`, `TIMED_OUT_TILE_EXECUTION: TileExecutionState`, `finishedTileExecution(result: ExecuteTradeResult): TileExecutionState`, `isTerminalTileExecution(state: TileExecutionState): boolean`.

- [ ] **Step 1: Domain constants**

Append to `packages/domain/src/fx/price.ts`:

```ts
/** Power-saver conflation interval for live prices: while the app is calm,
 * `priceStream.price$` delivers at most one price per this many ms
 * (leading + trailing). An application-layer timing, kept in the domain
 * beside `PRICE_HISTORY_SIZE` so every core and the contract tier read one
 * number. */
export const PRICE_CONFLATION_MS = 250;

/** Power-saver conflation interval for the sparkline windows
 * (`priceHistory.history$`). */
export const PRICE_HISTORY_CONFLATION_MS = 1_000;
```

Append to `packages/domain/src/fx/trade.ts`:

```ts
/** How long a newly-arrived blotter row stays highlighted (the `rowHighlight`
 * machine). Beside the other presentational timings above for the same
 * reason they are here: three application cores and the contract tier read
 * it. */
export const BLOTTER_ROW_HIGHLIGHT_MS = 3_000;

/** Maximum number of Activity-feed rows retained, newest first
 * (`blotter.activity$`). */
export const ACTIVITY_FEED_CAP = 40;
```

In `packages/domain/src/index.ts`, add `PRICE_CONFLATION_MS, PRICE_HISTORY_CONFLATION_MS` to the value-export list from `./fx/price.js` and `ACTIVITY_FEED_CAP, BLOTTER_ROW_HIGHLIGHT_MS` to the one from `./fx/trade.js` (alphabetical within each list — Biome sorts named exports).

Run: `pnpm --filter @rtc/domain build && pnpm --filter @rtc/domain test`
Expected: build clean, tests green.

- [ ] **Step 2: Failing tests for the four folds**

`packages/client-core/src/presenters/__tests__/blotterFolds.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRADER_NAME,
  Direction,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import {
  createActivityScan,
  createNewTradeScan,
  formatClockTime,
  reduceActivity,
  reduceNewTrades,
} from "#/presenters/blotterFolds";

describe("blotterFolds", () => {
  it("reduceNewTrades: the first snapshot is never new; later unseen ids are", () => {
    const first = reduceNewTrades(createNewTradeScan(), [createTrade(1)]);
    expect([...first.fresh]).toEqual([]);
    const second = reduceNewTrades(first, [createTrade(1), createTrade(2)]);
    expect([...second.fresh]).toEqual([2]);
    const third = reduceNewTrades(second, [createTrade(1), createTrade(2)]);
    expect([...third.fresh]).toEqual([]);
  });

  it("reduceActivity: seeded rows never appear; a live row is stamped with the supplied clock, newest first", () => {
    const seeded = reduceActivity(
      createActivityScan(),
      [createTrade(1, DEFAULT_TRADER_NAME)],
      0,
    );
    expect(seeded.entries).toEqual([]);
    const live = reduceActivity(
      seeded,
      [createTrade(1, DEFAULT_TRADER_NAME), createTrade(2, "A.Stark"), createTrade(3, DEFAULT_TRADER_NAME)],
      Date.UTC(2026, 0, 1, 9, 8, 7),
    );
    expect(live.entries.map((e) => e.trade.tradeId)).toEqual([3]);
    expect(live.entries[0].time).toBe(formatClockTime(Date.UTC(2026, 0, 1, 9, 8, 7)));
    // No additions → the SAME entries array (the RxJS scan's short-circuit).
    const unchanged = reduceActivity(live, [createTrade(1), createTrade(2), createTrade(3)], 1);
    expect(unchanged.entries).toBe(live.entries);
  });

  it("formatClockTime pads to HH:MM:SS", () => {
    expect(formatClockTime(new Date(2026, 0, 1, 1, 2, 3).getTime())).toBe("01:02:03");
  });

  function createTrade(tradeId: number, tradeName = "A.Stark"): Trade {
    return {
      tradeId,
      tradeName,
      currencyPair: "EURUSD",
      notional: 1_000_000,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1.1,
      status: TradeStatus.Done,
      tradeDate: "2026-01-01",
      valueDate: "2026-01-03",
    };
  }
});
```

`packages/client-core/src/presenters/__tests__/staleFlagFold.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

import { createStaleFlagAcc, reduceStaleFlag } from "#/presenters/staleFlagFold";

describe("staleFlagFold", () => {
  it("goes stale on reconnect after a disconnect and clears on a NEW value reference", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    let acc = createStaleFlagAcc<typeof a>();
    acc = reduceStaleFlag(acc, { kind: "status", status: ConnectionStatus.CONNECTED });
    acc = reduceStaleFlag(acc, { kind: "value", value: a });
    expect(acc.stale).toBe(false);
    acc = reduceStaleFlag(acc, { kind: "status", status: ConnectionStatus.DISCONNECTED });
    acc = reduceStaleFlag(acc, { kind: "status", status: ConnectionStatus.CONNECTED });
    expect(acc.stale).toBe(true);
    acc = reduceStaleFlag(acc, { kind: "value", value: a });
    expect(acc.stale).toBe(true);
    acc = reduceStaleFlag(acc, { kind: "value", value: b });
    expect(acc.stale).toBe(false);
  });

  it("never goes stale while connected throughout", () => {
    let acc = createStaleFlagAcc<number>();
    acc = reduceStaleFlag(acc, { kind: "status", status: ConnectionStatus.CONNECTED });
    acc = reduceStaleFlag(acc, { kind: "value", value: 1 });
    acc = reduceStaleFlag(acc, { kind: "status", status: ConnectionStatus.CONNECTED });
    expect(acc.stale).toBe(false);
  });
});
```

`packages/client-core/src/presenters/__tests__/notionalView.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createInitialNotionalView, reduceNotionalInput } from "#/presenters/notionalView";

describe("notionalView", () => {
  it("createInitialNotionalView formats the default with commas and flags RFQ above the threshold", () => {
    expect(createInitialNotionalView(1_000_000)).toEqual({
      displayValue: "1,000,000",
      numericValue: 1_000_000,
      error: null,
      isRfq: false,
      isDefault: true,
    });
    expect(createInitialNotionalView(20_000_000).isRfq).toBe(true);
  });

  it("reduceNotionalInput parses, reformats, and keeps raw input on a parse failure", () => {
    expect(reduceNotionalInput(1_000_000, "2m")).toEqual({
      displayValue: "2,000,000",
      numericValue: 2_000_000,
      error: null,
      isRfq: false,
      isDefault: false,
    });
    expect(reduceNotionalInput(1_000_000, "1m").isDefault).toBe(true);
    expect(reduceNotionalInput(1_000_000, "abc")).toEqual({
      displayValue: "abc",
      numericValue: 0,
      error: "Invalid input",
      isRfq: false,
      isDefault: false,
    });
    expect(reduceNotionalInput(1_000_000, "2000m").error).toBe("Max exceeded");
  });
});
```

`packages/client-core/src/presenters/__tests__/tileExecutionState.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Direction, ExecutionStatus, type Trade, TradeStatus } from "@rtc/domain";

import {
  finishedTileExecution,
  isTerminalTileExecution,
  READY_TILE_EXECUTION,
  STARTED_TILE_EXECUTION,
  TIMED_OUT_TILE_EXECUTION,
  TIMEOUT_TILE_EXECUTION,
  TOO_LONG_TILE_EXECUTION,
} from "#/presenters/tileExecutionState";

describe("tileExecutionState", () => {
  it("only finished and timeout are terminal", () => {
    expect(isTerminalTileExecution(READY_TILE_EXECUTION)).toBe(false);
    expect(isTerminalTileExecution(STARTED_TILE_EXECUTION)).toBe(false);
    expect(isTerminalTileExecution(TOO_LONG_TILE_EXECUTION)).toBe(false);
    expect(isTerminalTileExecution(TIMEOUT_TILE_EXECUTION)).toBe(true);
    expect(isTerminalTileExecution(TIMED_OUT_TILE_EXECUTION)).toBe(true);
  });

  it("finishedTileExecution carries the result's status and trade", () => {
    const trade: Trade = {
      tradeId: 1,
      tradeName: "You",
      currencyPair: "EURUSD",
      notional: 1,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1,
      status: TradeStatus.Done,
      tradeDate: "2026-01-01",
      valueDate: "2026-01-03",
    };
    expect(finishedTileExecution({ trade, status: ExecutionStatus.Done })).toEqual({
      status: "finished",
      executionStatus: ExecutionStatus.Done,
      trade,
    });
    expect(TIMED_OUT_TILE_EXECUTION).toEqual({
      status: "finished",
      executionStatus: ExecutionStatus.Timeout,
    });
  });
});
```

Run: `pnpm --filter @rtc/client-core exec vitest run src/presenters/__tests__/blotterFolds.test.ts src/presenters/__tests__/staleFlagFold.test.ts src/presenters/__tests__/notionalView.test.ts src/presenters/__tests__/tileExecutionState.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: The four fold files**

`packages/client-core/src/presenters/blotterFolds.ts` — the two `scan` steps of `BlotterPresenter`, verbatim logic, as pure functions:

```ts
import type { ActivityEntry } from "@rtc/core-api";
import { ACTIVITY_FEED_CAP, DEFAULT_TRADER_NAME, type Trade } from "@rtc/domain";

/** The `newTradeIds$` fold state. `seen` is MUTATED across steps (one Set
 * for the fold's life, as the RxJS `scan` seed was); `fresh` is rebuilt per
 * snapshot. Shared by the three application cores: the fold under test is
 * the same function driven by a different runtime. */
export interface NewTradeScan {
  readonly seen: Set<number>;
  readonly fresh: ReadonlySet<number>;
  readonly initialized: boolean;
}

/** The `activity$` fold state — same `seen` discipline as `NewTradeScan`. */
export interface ActivityScan {
  readonly seen: Set<number>;
  readonly entries: readonly ActivityEntry[];
  readonly initialized: boolean;
}

export function createNewTradeScan(): NewTradeScan {
  return { seen: new Set<number>(), fresh: new Set<number>(), initialized: false };
}

/** Ids that appeared in this snapshot and were never seen before — empty for
 * the first snapshot, so an initial load does not flash every row as new. */
export function reduceNewTrades(
  acc: NewTradeScan,
  trades: readonly Trade[],
): NewTradeScan {
  const fresh = new Set<number>();

  for (const trade of trades) {
    if (!acc.seen.has(trade.tradeId)) {
      if (acc.initialized) {
        fresh.add(trade.tradeId);
      }

      acc.seen.add(trade.tradeId);
    }
  }

  return { seen: acc.seen, fresh, initialized: true };
}

export function createActivityScan(): ActivityScan {
  return { seen: new Set<number>(), entries: [], initialized: false };
}

/** Live executions (`tradeName === DEFAULT_TRADER_NAME`) that appeared after
 * the first snapshot, newest first, capped at `ACTIVITY_FEED_CAP`. `now` is
 * the wall clock in ms — injected so the fold is pure and a test can pin it.
 * With no additions the SAME `entries` array is returned. */
export function reduceActivity(
  acc: ActivityScan,
  trades: readonly Trade[],
  now: number,
): ActivityScan {
  const additions: ActivityEntry[] = [];

  for (const trade of trades) {
    if (acc.seen.has(trade.tradeId)) {
      continue;
    }

    acc.seen.add(trade.tradeId);

    if (acc.initialized && trade.tradeName === DEFAULT_TRADER_NAME) {
      additions.push({ trade, time: formatClockTime(now) });
    }
  }

  const entries =
    additions.length > 0
      ? [...additions, ...acc.entries].slice(0, ACTIVITY_FEED_CAP)
      : acc.entries;

  return { seen: acc.seen, entries, initialized: true };
}

/** Wall-clock HH:MM:SS, local time. */
export function formatClockTime(ms: number): string {
  const d = new Date(ms);

  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
```

`packages/client-core/src/presenters/staleFlagFold.ts`:

```ts
import { ConnectionStatus } from "@rtc/domain";

/** One input of the stale-flag fold: a connection status or a watched value. */
export type StaleFlagEvent<T> =
  | { kind: "status"; status: ConnectionStatus }
  | { kind: "value"; value: T };

export interface StaleFlagAcc<T> {
  readonly wasDisconnected: boolean;
  readonly current: T | undefined;
  readonly hasValue: boolean;
  readonly valueAtReconnect: T | undefined;
  readonly stale: boolean;
}

export function createStaleFlagAcc<T>(): StaleFlagAcc<T> {
  return {
    wasDisconnected: false,
    current: undefined,
    hasValue: false,
    valueAtReconnect: undefined,
    stale: false,
  };
}

/** The rule, reference-equality and all (relocated from the old
 * useStaleDetection hook): latch `wasDisconnected` whenever status leaves
 * CONNECTED; on the reconnect record the value reference held at that moment
 * and go stale; clear the moment a NEW value reference (`!==`) arrives; a
 * same-reference re-emission after reconnect is not new data. */
export function reduceStaleFlag<T>(
  acc: StaleFlagAcc<T>,
  event: StaleFlagEvent<T>,
): StaleFlagAcc<T> {
  if (event.kind === "status") {
    if (event.status !== ConnectionStatus.CONNECTED) {
      return { ...acc, wasDisconnected: true };
    }

    if (acc.wasDisconnected) {
      return {
        ...acc,
        wasDisconnected: false,
        valueAtReconnect: acc.current,
        stale: true,
      };
    }

    return acc;
  }

  const next: StaleFlagAcc<T> = { ...acc, current: event.value, hasValue: true };

  if (acc.stale && event.value !== acc.valueAtReconnect) {
    return { ...next, stale: false };
  }

  return next;
}
```


`packages/client-core/src/presenters/notionalView.ts`:

```ts
import type { NotionalView } from "@rtc/core-api";
import { isRfqRequired, parseNotional } from "@rtc/domain";

export function formatWithCommas(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
    useGrouping: true,
  });
}

/** The view a notional machine starts from, and returns to on `reset`. */
export function createInitialNotionalView(defaultNotional: number): NotionalView {
  return {
    displayValue: formatWithCommas(defaultNotional),
    numericValue: defaultNotional,
    error: null,
    isRfq: isRfqRequired(defaultNotional),
    isDefault: true,
  };
}

/** The view for one `change(input)`: a parse failure keeps the raw input and
 * carries the error; a parse success is reformatted with commas. */
export function reduceNotionalInput(
  defaultNotional: number,
  input: string,
): NotionalView {
  const result = parseNotional(input);

  if (result.value === null) {
    return {
      displayValue: input,
      numericValue: 0,
      error: result.error,
      isRfq: false,
      isDefault: false,
    };
  }

  return {
    displayValue: formatWithCommas(result.value),
    numericValue: result.value,
    error: result.error,
    isRfq: isRfqRequired(result.value),
    isDefault: result.value === defaultNotional,
  };
}
```

`packages/client-core/src/presenters/tileExecutionState.ts`:

```ts
import type { TileExecutionState } from "@rtc/core-api";
import { type ExecuteTradeResult, ExecutionStatus } from "@rtc/domain";

export const READY_TILE_EXECUTION: TileExecutionState = { status: "ready" };
export const STARTED_TILE_EXECUTION: TileExecutionState = { status: "started" };
export const TOO_LONG_TILE_EXECUTION: TileExecutionState = { status: "tooLong" };
/** The local `EXECUTION_TIMEOUT_MS` timer fired with no result at all. */
export const TIMEOUT_TILE_EXECUTION: TileExecutionState = { status: "timeout" };
/** The command itself failed — reported as a finished execution with the
 * Timeout status, NOT as the `timeout` state above. */
export const TIMED_OUT_TILE_EXECUTION: TileExecutionState = {
  status: "finished",
  executionStatus: ExecutionStatus.Timeout,
};

export function finishedTileExecution(
  result: ExecuteTradeResult,
): TileExecutionState {
  return { status: "finished", executionStatus: result.status, trade: result.trade };
}

export function isTerminalTileExecution(state: TileExecutionState): boolean {
  return state.status === "finished" || state.status === "timeout";
}
```

Run the four new tests. Expected: PASS.

- [ ] **Step 4: Point the RxJS classes at the folds and the domain constants**

- `BlotterPresenter.ts`: delete the local `NewTradeScan`, `ActivityScan`, `pad2`, `formatClockTime`; import `createActivityScan`, `createNewTradeScan`, `reduceActivity`, `reduceNewTrades` from `#/presenters/blotterFolds`; the two `scan(...)` calls become `scan(reduceNewTrades, createNewTradeScan())` and `scan((acc: ActivityScan, trades: readonly Trade[]) => { return reduceActivity(acc, trades, Date.now()); }, createActivityScan())`; replace `export const ACTIVITY_CAP = 40;` with `export const ACTIVITY_CAP = ACTIVITY_FEED_CAP;` (import from `@rtc/domain`), keeping its doc comment plus one line: "now the domain's `ACTIVITY_FEED_CAP`; kept under this name for the two web clients' imports".
- `StaleFlagMachine.ts`: delete the local `Event`, `Acc`, `initial` and the inline reducer; `scan(reduceStaleFlag, createStaleFlagAcc<T>())`; keep `StaleFlagDeps<T>` and `createStaleFlagMachine`. Re-export the event/acc types: `export type { StaleFlagAcc, StaleFlagEvent } from "#/presenters/staleFlagFold";` is NOT needed — `index.ts` exports the fold file directly (Step 5).
- `NotionalMachine.ts`: delete `formatWithCommas`, `makeInitialView` and the inline `map`; `const initial = createInitialNotionalView(defaultNotional);` and `map((event): NotionalView => { return event.type === "reset" ? initial : reduceNotionalInput(defaultNotional, event.input); })`.
- `TileExecutionMachine.ts`: delete `READY` and `isTerminal`; use `READY_TILE_EXECUTION`, `STARTED_TILE_EXECUTION`, `TOO_LONG_TILE_EXECUTION`, `TIMEOUT_TILE_EXECUTION`, `TIMED_OUT_TILE_EXECUTION`, `finishedTileExecution`, `isTerminalTileExecution` at the seven sites (`of<TileExecutionState>({ status: "started" })`, the `scan` seed, `map((r) => ...)`, `catchError(() => of(...))`, the two `timer(...).pipe(map(...))`, `state(stream$, READY)` and the dismiss `map`).
- `RowHighlightMachine.ts`: `export const HIGHLIGHT_MS = BLOTTER_ROW_HIGHLIGHT_MS;` (import from `@rtc/domain`), doc comment kept plus "now the domain's `BLOTTER_ROW_HIGHLIGHT_MS`; kept under this name for `BlotterRow.tsx` in both web clients and the React contract harness".
- `PriceStreamPresenter.ts`: delete the local `PRICE_CONFLATION_MS`; import it from `@rtc/domain`. `PriceHistoryPresenter.ts`: same for `HISTORY_CONFLATION_MS` → `PRICE_HISTORY_CONFLATION_MS`.

- [ ] **Step 5: Export from the package index**

Add to `packages/client-core/src/presenters/index.ts` (alphabetical among the `export *` lines):

```ts
export * from "#/presenters/blotterFolds";
export * from "#/presenters/notionalView";
export * from "#/presenters/staleFlagFold";
export * from "#/presenters/tileExecutionState";
```

Check `packages/client-core/src/index.ts` re-exports `#/presenters/index` wholesale (it does today — `export * from "#/presenters"`; if it lists names, add these).

- [ ] **Step 6: The whole client-core suite, unchanged, is the witness**

Run: `pnpm --filter @rtc/client-core build && pnpm --filter @rtc/client-core test`
Expected: green — including every test under `src/presenters/__tests__/` for the seven touched files and `composition.machineFactories.test.ts`. Then `pnpm --filter @rtc/client-core-async test && pnpm --filter @rtc/client-core-effect test` (they resolve `@rtc/client-core` through `dist`; still delegating, still green). Then `pnpm exec biome ci packages/domain packages/client-core` and `pnpm exec eslint packages/domain/src packages/client-core/src` clean; `pnpm exec knip` clean (the new exports are consumed inside the package; if knip flags an export as unused, it is consumed by Tasks 4–5 — leave it and note in the report; PR A's gauntlet decides).

- [ ] **Step 7: Commit**

```bash
git add packages/domain packages/client-core
git commit -m "refactor(client-core): export the FX folds; slice-2 timing constants move to @rtc/domain

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

---

### Task 2: The harness — scripted FX ports, driver verbs, fixtures, fake clock

**Files:**
- Modify: `packages/core-contract/src/harness/scriptedPorts.ts` (whole file replaced below)
- Create: `packages/core-contract/src/harness/fixtures.ts`
- Create: `packages/core-contract/src/harness/clock.ts`
- Modify: `packages/core-contract/src/harness/scriptedPorts.test.ts` (append cases)
- Create: `packages/core-contract/src/harness/clock.test.ts`
- Modify: `packages/core-contract/src/index.ts`

**Interfaces:**
- Consumes: `@rtc/domain` types only (`PriceTick`, `Price`, `PriceMovementType`, `Trade`, `TradeStatus`, `Direction`, `ExecutionRequest`, `PositionUpdates`, `CurrencyPair`, `KNOWN_CURRENCY_PAIRS`, `PricingPort`, `ReferenceDataPort`, `BlotterPort`, `AnalyticsPort`, `ExecutionPort`). Nothing from Task 1.
- Produces (used by Task 3, and by Tasks 4–5's unit tests where convenient):
  - `ScriptedDriver` gains: `tickPrice(tick: PriceTick): void`, `failPrice(symbol: string, error: unknown): void`, `priceObserved(symbol: string): boolean`, `emitPairs(pairs: readonly CurrencyPair[]): void`, `pairsObserved(): boolean`, `emitTrades(trades: readonly Trade[]): void`, `tradesObserved(): boolean`, `emitPosition(update: PositionUpdates): void`, `positionObserved(): boolean`, `pendingExecutions(): readonly ExecutionRequest[]`, `resolveExecution(trade: Trade): void`, `failExecution(error: unknown): void`.
  - `PortMethodName` gains `"referenceData.getCurrencyPairs" | "blotter.getTradeStream" | "analytics.getAnalytics"`.
  - `fixtures.ts`: `EURUSD: CurrencyPair` (= `KNOWN_CURRENCY_PAIRS[0]`), `GBPUSD: CurrencyPair` (the `GBPUSD` entry), `createTick(symbol: string, mid: number, at?: number): PriceTick`, `createPrice(symbol: string, mid: number): Price`, `createTrade(overrides?: Partial<Trade>): Trade`, `createPositionUpdates(usdPnl: number): PositionUpdates`.
  - `clock.ts`: `interface FakeClock { advance(ms: number): Promise<void>; settle(): Promise<void>; }`, `withFakeClock(run: (clock: FakeClock) => Promise<void>): Promise<void>`.

- [ ] **Step 1: Failing harness tests**

Append to `packages/core-contract/src/harness/scriptedPorts.test.ts` (inside its top-level `describe`; reuse its existing base-ports factory — read the file first; if its factory is named differently, use that name):

```ts
  it("pricing: getPriceUpdates(symbol) is a per-symbol stream the driver ticks; observed only while subscribed", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const seen: number[] = [];
    expect(driver.priceObserved("EURUSD")).toBe(false);
    const sub = ports.pricing.getPriceUpdates("EURUSD").subscribe((tick) => {
      seen.push(tick.mid);
    });
    expect(driver.priceObserved("EURUSD")).toBe(true);
    driver.tickPrice(createTick("EURUSD", 1.1));
    driver.tickPrice(createTick("GBPUSD", 1.3));
    expect(seen).toEqual([1.1]);
    sub.unsubscribe();
    expect(driver.priceObserved("EURUSD")).toBe(false);
  });

  it("pricing: failPrice errors that symbol's subscribers", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const errors: unknown[] = [];
    ports.pricing.getPriceUpdates("EURUSD").subscribe({ error: (e: unknown) => { errors.push(e); } });
    driver.failPrice("EURUSD", new Error("feed"));
    expect(errors).toHaveLength(1);
  });

  it("execution: a request is pending only once the returned stream is subscribed; resolveExecution completes the OLDEST", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const request = { currencyPair: "EURUSD", spotRate: 1.1, direction: Direction.Buy, notional: 1, dealtCurrency: "EUR" };
    const first = ports.execution.executeTrade(request);
    expect(driver.pendingExecutions()).toEqual([]);
    const results: Trade[] = [];
    let completed = false;
    first.subscribe({ next: (t) => { results.push(t); }, complete: () => { completed = true; } });
    ports.execution.executeTrade({ ...request, notional: 2 }).subscribe();
    expect(driver.pendingExecutions().map((r) => r.notional)).toEqual([1, 2]);
    const trade = createTrade({ notional: 1 });
    driver.resolveExecution(trade);
    expect(results).toEqual([trade]);
    expect(completed).toBe(true);
    expect(driver.pendingExecutions().map((r) => r.notional)).toEqual([2]);
    driver.failExecution(new Error("bust"));
    expect(driver.pendingExecutions()).toEqual([]);
    // Nothing pending: a no-op, never a throw.
    driver.resolveExecution(trade);
  });

  it("execution: unsubscribing a pending request withdraws it", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const sub = ports.execution.executeTrade({ currencyPair: "EURUSD", spotRate: 1, direction: Direction.Sell, notional: 5, dealtCurrency: "EUR" }).subscribe();
    expect(driver.pendingExecutions()).toHaveLength(1);
    sub.unsubscribe();
    expect(driver.pendingExecutions()).toEqual([]);
  });

  it("referenceData / blotter / analytics: driver-fed streams, observed flags, and counted port calls", () => {
    const { ports, driver } = scriptPorts(createBasePorts());
    const pairs: readonly CurrencyPair[][] = [];
    const trades: readonly Trade[][] = [];
    const positions: PositionUpdates[] = [];
    ports.referenceData.getCurrencyPairs().subscribe((p) => { pairs.push(p); });
    ports.blotter.getTradeStream().subscribe((t) => { trades.push(t); });
    ports.analytics.getAnalytics("USD").subscribe((u) => { positions.push(u); });
    expect(driver.pairsObserved()).toBe(true);
    expect(driver.tradesObserved()).toBe(true);
    expect(driver.positionObserved()).toBe(true);
    driver.emitPairs([EURUSD]);
    driver.emitTrades([createTrade()]);
    driver.emitPosition(createPositionUpdates(42));
    expect(pairs).toEqual([[EURUSD]]);
    expect(trades[0]).toHaveLength(1);
    expect(positions[0].history[0].usdPnl).toBe(42);
    expect(driver.portCalls("referenceData.getCurrencyPairs")).toBe(1);
    expect(driver.portCalls("blotter.getTradeStream")).toBe(1);
    expect(driver.portCalls("analytics.getAnalytics")).toBe(1);
  });
```

Add the imports the cases need: `Direction`, `type CurrencyPair`, `type PositionUpdates`, `type Trade` from `@rtc/domain`; `createPositionUpdates`, `createTick`, `createTrade`, `EURUSD` from `#/harness/fixtures`.

`packages/core-contract/src/harness/clock.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { withFakeClock } from "#/harness/clock";

describe("withFakeClock", () => {
  it("advances timers deterministically and restores real timers afterwards", async () => {
    let fired = false;
    await withFakeClock(async (clock) => {
      setTimeout(() => {
        fired = true;
      }, 1_000);
      await clock.advance(999);
      expect(fired).toBe(false);
      await clock.advance(1);
      expect(fired).toBe(true);
    });
    expect(vi.isFakeTimers()).toBe(false);
  });

  it("settle() runs continuations scheduled at zero delay, twice over", async () => {
    await withFakeClock(async (clock) => {
      const order: string[] = [];
      setTimeout(() => {
        order.push("first");
        setTimeout(() => {
          order.push("second");
        }, 0);
      }, 0);
      await clock.settle();
      expect(order).toEqual(["first", "second"]);
    });
  });

  it("restores real timers when the body throws", async () => {
    await expect(
      withFakeClock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(vi.isFakeTimers()).toBe(false);
  });
});
```

Run: `pnpm --filter @rtc/core-contract test`
Expected: FAIL — `tickPrice` etc. missing; `#/harness/fixtures`, `#/harness/clock` not found.

- [ ] **Step 2: Fixtures**

`packages/core-contract/src/harness/fixtures.ts`:

```ts
import {
  type CurrencyPair,
  Direction,
  KNOWN_CURRENCY_PAIRS,
  type PositionUpdates,
  type Price,
  PriceMovementType,
  type PriceTick,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

/** The pair every suite defaults to, and a second one for identity cases. */
export const EURUSD: CurrencyPair = findPair("EURUSD");
export const GBPUSD: CurrencyPair = findPair("GBPUSD");

/** A raw port tick around `mid` with a 1-pip spread. `at` defaults to 0 so
 * two ticks built in one test are distinguishable only by `mid` — pass a
 * timestamp when order matters. */
export function createTick(symbol: string, mid: number, at = 0): PriceTick {
  return {
    symbol,
    bid: mid - 0.00005,
    ask: mid + 0.00005,
    mid,
    valueDate: "2026-01-03",
    creationTimestamp: at,
  };
}

/** An enriched price, for machine intents that take one (`tileExecution`). */
export function createPrice(symbol: string, mid: number): Price {
  return { ...createTick(symbol, mid), movementType: PriceMovementType.NONE, spread: "1.0" };
}

export function createTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    tradeId: 1,
    tradeName: "A.Stark",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.1,
    status: TradeStatus.Done,
    tradeDate: "2026-01-01",
    valueDate: "2026-01-03",
    ...overrides,
  };
}

export function createPositionUpdates(usdPnl: number): PositionUpdates {
  return {
    currentPositions: [],
    history: [{ timestamp: "2026-01-01T00:00:00.000Z", usdPnl }],
  };
}

function findPair(symbol: string): CurrencyPair {
  const pair = KNOWN_CURRENCY_PAIRS.find((candidate) => {
    return candidate.symbol === symbol;
  });

  if (pair === undefined) {
    throw new Error(`fixtures: ${symbol} is not a known currency pair`);
  }

  return pair;
}
```

- [ ] **Step 3: The fake clock**

`packages/core-contract/src/harness/clock.ts`:

```ts
import { vi } from "vitest";

/** The clock a timer-driven suite drives. `advance` moves fake time and runs
 * every timer that falls due, awaiting the microtasks between them;
 * `settle` is the fake-clock twin of `#/harness/settle`: two zero-length
 * advances, enough for a two-hop chain (port → fold → subscriber) to land
 * on any of the three cores' schedulers. */
export interface FakeClock {
  advance(ms: number): Promise<void>;
  settle(): Promise<void>;
}

/** Run one test body under vitest's fake timers, restoring real timers
 * afterwards whatever happens. Build the harness INSIDE `run` — a scheduler
 * that captured a real `setTimeout` before the swap would never advance.
 * Never call the real `settle()` inside: it waits on the real `setTimeout`,
 * which is exactly what is faked here. */
export async function withFakeClock(
  run: (clock: FakeClock) => Promise<void>,
): Promise<void> {
  vi.useFakeTimers();

  try {
    await run({
      advance: (ms: number) => {
        return vi.advanceTimersByTimeAsync(ms);
      },
      settle: async () => {
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(0);
      },
    });
  } finally {
    vi.useRealTimers();
  }
}
```

- [ ] **Step 4: The scripted ports**

Replace `packages/core-contract/src/harness/scriptedPorts.ts` with:

```ts
import { BehaviorSubject, merge, Observable, Subject } from "rxjs";

import type { AppPorts, ColorSchemeSource, Stream } from "@rtc/core-api";
import type {
  AnalyticsPort,
  BlotterPort,
  ConnectionEvent,
  ConnectionEventsPort,
  CurrencyPair,
  ExecutionPort,
  ExecutionRequest,
  PositionUpdates,
  PreferencesPort,
  PricingPort,
  PriceTick,
  ReferenceDataPort,
  Trade,
} from "@rtc/domain";

/** A port method name the discipline suite can count — the `$`-suffixed
 * stream methods of `PreferencesPort`, plus the app-lifetime methods the
 * harness supplies itself: `connectionEvents.events`,
 * `colorScheme.prefersDark$`, and the three FX singletons every core calls
 * once at construction. `pricing.getPriceUpdates` is deliberately NOT here:
 * a per-key stream is opened per warm period through the use case's
 * `defer`, in the RxJS core as in the others. */
export type PortMethodName =
  | Extract<keyof PreferencesPort, `${string}$`>
  | "connectionEvents.events"
  | "colorScheme.prefersDark$"
  | "referenceData.getCurrencyPairs"
  | "blotter.getTradeStream"
  | "analytics.getAnalytics";

/** Wrap a port so every method call is counted by name. A Proxy rather than
 * a spread: a class port's methods live on its prototype, which a spread
 * drops. The `get` trap only INSTALLS the counting wrapper; the count
 * happens inside that wrapper, on invocation — so a property read that is
 * never called does not count, and the witness is calls, not reads. */
function countCalls<P extends object>(
  port: P,
  counts: Map<string, number>,
  prefix = "",
): P {
  return new Proxy(port, {
    get: (target: P, property: string | symbol, receiver: unknown) => {
      const value = Reflect.get(target, property, receiver);

      if (typeof value === "function" && typeof property === "string") {
        return (...args: unknown[]) => {
          const key = `${prefix}${property}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return Reflect.apply(value, target, args);
        };
      }

      return value;
    },
  });
}

/** One execution the core has SUBSCRIBED and the driver has not yet settled. */
interface PendingExecution {
  readonly request: ExecutionRequest;
  readonly result: Subject<Trade>;
}

export interface ScriptedDriver {
  /** Push one connection event into the stream the core observes. */
  emitConnection(event: ConnectionEvent): void;
  /** Error the connection-event stream the core observes — a real source
   * failure, not a domain event, so it reaches `Collected.errors` rather
   * than folding into a status value. Terminal, like the Subject it drives:
   * a later `emitConnection`/`failConnection` is a no-op after this. */
  failConnection(error: unknown): void;
  /** The merged connection-event stream the core sees — includes whatever
   * the runner's base port carries (e.g. the RxJS core's `reconnect$`). */
  connectionEvents$(): Stream<ConnectionEvent>;
  /** Flip the OS colour scheme the theme presenter resolves "system" against. */
  setPrefersDark(on: boolean): void;
  /** How many times the core has invoked this port method since the harness
   * was built — the "called once, at construction" discipline's witness. */
  portCalls(method: PortMethodName): number;
  /** Push one raw tick into `pricing.getPriceUpdates(tick.symbol)`. A tick
   * for a symbol nobody has subscribed reaches nobody. */
  tickPrice(tick: PriceTick): void;
  /** Error that symbol's price stream — terminal for its current subscribers;
   * the next `getPriceUpdates(symbol)` subscription gets a fresh Subject. */
  failPrice(symbol: string, error: unknown): void;
  /** Whether the core currently holds a subscription to that symbol's price
   * stream — the teardown-on-last-unsubscribe witness for per-key streams. */
  priceObserved(symbol: string): boolean;
  /** Push the currency-pair roster into `referenceData.getCurrencyPairs()`. */
  emitPairs(pairs: readonly CurrencyPair[]): void;
  pairsObserved(): boolean;
  /** Push one blotter snapshot into `blotter.getTradeStream()`. */
  emitTrades(trades: readonly Trade[]): void;
  tradesObserved(): boolean;
  /** Push one position update into `analytics.getAnalytics(_)`. */
  emitPosition(update: PositionUpdates): void;
  positionObserved(): boolean;
  /** Every execution request the core has subscribed and the driver has not
   * settled, oldest first. A call of `executeTrade` that nobody subscribed
   * is not here — laziness is the core's property, witnessed through this. */
  pendingExecutions(): readonly ExecutionRequest[];
  /** Settle the OLDEST pending execution with this trade (next + complete).
   * A no-op when nothing is pending. */
  resolveExecution(trade: Trade): void;
  /** Error the OLDEST pending execution. A no-op when nothing is pending. */
  failExecution(error: unknown): void;
}

export interface ScriptedPorts {
  ports: AppPorts;
  driver: ScriptedDriver;
  teardown(): void;
}

/** Wrap a runner-supplied `AppPorts` so the suites can drive connection
 * events, the colour scheme and the five FX ports deterministically. The
 * FX ports are REPLACED, not merged: the base simulators tick on real,
 * random timers a suite cannot assert against. Everything else in `base` is
 * passed through untouched — the runner decides what backs it. */
export function scriptPorts(base: AppPorts): ScriptedPorts {
  const connection$ = new Subject<ConnectionEvent>();
  const prefersDark$ = new BehaviorSubject<boolean>(false);
  const calls = new Map<string, number>();
  const preferences = countCalls(base.preferences, calls);
  const prices = new Map<string, Subject<PriceTick>>();
  const pairs$ = new Subject<readonly CurrencyPair[]>();
  const trades$ = new Subject<readonly Trade[]>();
  const position$ = new Subject<PositionUpdates>();
  const pending: PendingExecution[] = [];

  // Built ONCE, and handed to both the core (through `connectionEvents`) and
  // the suites (through `driver.connectionEvents$()`), so the two can never
  // observe different merge instances. Rebuilding it per call would be
  // observationally equivalent only while every runner's base port is hot
  // (client-core's `reconnect$` is a bare Subject); against a base port that
  // returns a cold per-subscribe stream, the reconnect suite would go green
  // on a stream the core never saw. The consequence — `base.connectionEvents
  // .events()` is called once here rather than once per subscription — is the
  // intended semantics: one shared stream.
  const events$ = merge(base.connectionEvents.events(), connection$);

  // The ports the harness supplies itself are outside `countCalls`' Proxy,
  // so they count their own calls — on invocation, exactly as the wrapper
  // does.
  function recordCall(method: PortMethodName): void {
    calls.set(method, (calls.get(method) ?? 0) + 1);
  }

  /** The live Subject for a symbol — replaced after a failure, so the next
   * subscription starts clean (a terminated Subject would replay its error). */
  function priceSubject(symbol: string): Subject<PriceTick> {
    const existing = prices.get(symbol);

    if (existing !== undefined && !existing.closed && !existing.hasError) {
      return existing;
    }

    const fresh = new Subject<PriceTick>();
    prices.set(symbol, fresh);
    return fresh;
  }

  function settlePending(settle: (result: Subject<Trade>) => void): void {
    const oldest = pending.shift();

    if (oldest !== undefined) {
      settle(oldest.result);
    }
  }

  const connectionEvents: ConnectionEventsPort = {
    events: (): Observable<ConnectionEvent> => {
      recordCall("connectionEvents.events");
      return events$;
    },
  };

  const colorScheme: ColorSchemeSource = {
    prefersDark$: (): Observable<boolean> => {
      recordCall("colorScheme.prefersDark$");
      return prefersDark$;
    },
  };

  const pricing: PricingPort = {
    // Deferred so each SUBSCRIPTION resolves the live Subject: after a
    // `failPrice` the replacement is what a fresh warm period gets.
    getPriceUpdates: (symbol: string): Observable<PriceTick> => {
      return new Observable<PriceTick>((subscriber) => {
        return priceSubject(symbol).subscribe(subscriber);
      });
    },
    getPriceHistory: (symbol: string): Observable<readonly PriceTick[]> => {
      return base.pricing.getPriceHistory(symbol);
    },
    getRfqQuote: (symbol: string, pipsPosition: number) => {
      return base.pricing.getRfqQuote(symbol, pipsPosition);
    },
  };

  const referenceData: ReferenceDataPort = {
    getCurrencyPairs: (): Observable<readonly CurrencyPair[]> => {
      recordCall("referenceData.getCurrencyPairs");
      return pairs$;
    },
  };

  const blotter: BlotterPort = {
    getTradeStream: (): Observable<readonly Trade[]> => {
      recordCall("blotter.getTradeStream");
      return trades$;
    },
  };

  const analytics: AnalyticsPort = {
    getAnalytics: (): Observable<PositionUpdates> => {
      recordCall("analytics.getAnalytics");
      return position$;
    },
  };

  const execution: ExecutionPort = {
    // The request becomes pending when the core SUBSCRIBES, not when it
    // calls: a `defer`, so "lazy until subscribed" is the core's property.
    executeTrade: (request: ExecutionRequest): Observable<Trade> => {
      return new Observable<Trade>((subscriber) => {
        const entry: PendingExecution = { request, result: new Subject<Trade>() };
        pending.push(entry);
        const inner = entry.result.subscribe(subscriber);

        return () => {
          inner.unsubscribe();
          const index = pending.indexOf(entry);

          if (index >= 0) {
            pending.splice(index, 1);
          }
        };
      });
    },
  };

  return {
    ports: {
      ...base,
      preferences,
      connectionEvents,
      colorScheme,
      pricing,
      referenceData,
      blotter,
      analytics,
      execution,
    },
    driver: {
      emitConnection: (event: ConnectionEvent) => {
        connection$.next(event);
      },
      failConnection: (error: unknown) => {
        connection$.error(error);
      },
      connectionEvents$: () => {
        return events$;
      },
      setPrefersDark: (on: boolean) => {
        prefersDark$.next(on);
      },
      portCalls: (method: PortMethodName) => {
        return calls.get(method) ?? 0;
      },
      tickPrice: (tick: PriceTick) => {
        prices.get(tick.symbol)?.next(tick);
      },
      failPrice: (symbol: string, error: unknown) => {
        prices.get(symbol)?.error(error);
      },
      priceObserved: (symbol: string) => {
        return prices.get(symbol)?.observed ?? false;
      },
      emitPairs: (next: readonly CurrencyPair[]) => {
        pairs$.next(next);
      },
      pairsObserved: () => {
        return pairs$.observed;
      },
      emitTrades: (next: readonly Trade[]) => {
        trades$.next(next);
      },
      tradesObserved: () => {
        return trades$.observed;
      },
      emitPosition: (update: PositionUpdates) => {
        position$.next(update);
      },
      positionObserved: () => {
        return position$.observed;
      },
      pendingExecutions: () => {
        return pending.map((entry) => {
          return entry.request;
        });
      },
      resolveExecution: (trade: Trade) => {
        settlePending((result) => {
          result.next(trade);
          result.complete();
        });
      },
      failExecution: (error: unknown) => {
        settlePending((result) => {
          result.error(error);
        });
      },
    },
    teardown: () => {
      connection$.complete();
      prefersDark$.complete();

      for (const subject of prices.values()) {
        subject.complete();
      }

      pairs$.complete();
      trades$.complete();
      position$.complete();

      for (const entry of pending.splice(0)) {
        entry.result.complete();
      }
    },
  };
}
```

Notes for the implementer: `Subject.observed`, `closed`, `hasError` are public rxjs 7 fields. `getRfqQuote`'s return type is `Observable<RfqQuoteResult>` — import the type from `@rtc/domain` for the explicit-return-type rule.

- [ ] **Step 5: Export**

In `packages/core-contract/src/index.ts` add:

```ts
export { type FakeClock, withFakeClock } from "#/harness/clock";
export {
  createPositionUpdates,
  createPrice,
  createTick,
  createTrade,
  EURUSD,
  GBPUSD,
} from "#/harness/fixtures";
```

- [ ] **Step 6: Run**

`pnpm --filter @rtc/core-contract test` → green (old cases untouched, five new port cases, three clock cases). `pnpm --filter @rtc/core-contract build`. Then the three runners, still green (nothing consumes the new ports yet): `pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts`, `pnpm --filter @rtc/client-core-async exec vitest run src/coreContract.test.ts`, `pnpm --filter @rtc/client-core-effect exec vitest run src/coreContract.test.ts`. Biome + ESLint on `packages/core-contract` clean; knip clean (every new export is consumed by Task 3 — if knip runs before Task 3 lands, list the flagged names in the report).

- [ ] **Step 7: Commit**

```bash
git add packages/core-contract
git commit -m "test(core-contract): scripted FX ports, execution driver, fixtures and a fake clock for slice 2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

---

### Task 3: The eleven contract suites, green on RxJS — then ship PR A

**Files:**
- Create: `packages/core-contract/src/suites/priceStream.ts`, `priceHistory.ts`, `currencyPairs.ts`, `blotter.ts`, `analytics.ts`, `execution.ts`, `staleFlag.ts`, `analyticsStaleFlag.ts`, `rowHighlight.ts`, `notional.ts`, `tileExecution.ts`
- Modify: `packages/core-contract/src/suites/portDiscipline.ts` (three cases appended inside the `describe`)
- Modify: `packages/core-contract/src/registry.ts`, `packages/core-contract/src/registry.test.ts`

**Interfaces:**
- Consumes: Task 1's domain constants (`PRICE_CONFLATION_MS`, `PRICE_HISTORY_CONFLATION_MS`, `BLOTTER_ROW_HIGHLIGHT_MS`, `ACTIVITY_FEED_CAP`) and Task 2's driver verbs, fixtures and `withFakeClock`. `PRICE_HISTORY_SIZE`, `TOO_LONG_THRESHOLD_MS`, `EXECUTION_TIMEOUT_MS`, `CONFIRMATION_DISMISS_MS`, `ExecutionStatus`, `TradeStatus`, `Direction`, `PriceMovementType`, `DEFAULT_TRADER_NAME`, `calculateSpread`, `ConnectionStatus` from `@rtc/domain` (all exported today).
- Produces: `describePriceStreamContract`, `describePriceHistoryContract`, `describeCurrencyPairsContract`, `describeBlotterContract`, `describeAnalyticsContract`, `describeExecutionContract`, `describeStaleFlagContract`, `describeAnalyticsStaleFlagContract`, `describeRowHighlightContract`, `describeNotionalContract`, `describeTileExecutionContract` — each `(label: string, makeHarness: MakeHarness) => void`, registered in `CONTRACT_SUITES`.

Every suite follows the connection-suite idiom: one `makeHarness()` per `it`, `try { … } finally { await h.teardown(); }`, first value asserted synchronously, later values after `settle()` — or, inside `withFakeClock`, after `clock.settle()` (never the real `settle()`). A machine is created before the `try` and disposed in the `finally` before `teardown`. Power-saver level literals are `"off" | "calm" | "freeze"` (`PowerSaverLevel`, default `"off"`).

- [ ] **Step 1: Register the eleven (they fail to compile until the files exist — that is the failing state)**

In `packages/core-contract/src/registry.ts`: import the eleven `describe*Contract` functions (alphabetical, `#/suites/<file>`), replace the eleven `null`s — `presenters.priceStream`, `presenters.priceHistory`, `presenters.execution`, `presenters.blotter`, `presenters.analytics`, `presenters.currencyPairs`, `machines.tileExecution`, `machines.staleFlag`, `machines.analyticsStaleFlag`, `machines.rowHighlight`, `machines.notional` — with the functions, and delete those eleven entries from `PENDING_SUITES` (43 remain).

In `registry.test.ts` add, after the "slice 1b members have suites" case:

```ts
  it("slice 2 members have suites", () => {
    for (const member of [
      "presenters.priceStream",
      "presenters.priceHistory",
      "presenters.currencyPairs",
      "presenters.blotter",
      "presenters.analytics",
      "presenters.execution",
      "machines.staleFlag",
      "machines.analyticsStaleFlag",
      "machines.rowHighlight",
      "machines.notional",
      "machines.tileExecution",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }
  });
```

Run: `pnpm --filter @rtc/core-contract typecheck` → FAIL (missing modules). That is the red state; Steps 2–12 turn it green one suite at a time.

- [ ] **Step 2: `priceStream`**

`packages/core-contract/src/suites/priceStream.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  calculateSpread,
  type Price,
  PRICE_CONFLATION_MS,
  PriceMovementType,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createTick, EURUSD, GBPUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

function mid(price: Price): number {
  return price.mid;
}

export function describePriceStreamContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("price$(pair) is memoised per pair: same pair, same stream; another pair, another", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.priceStream;
        expect(p.price$(EURUSD)).toBe(p.price$(EURUSD));
        expect(p.price$(EURUSD)).not.toBe(p.price$(GBPUSD));
      } finally {
        await h.teardown();
      }
    });

    it("emits nothing until the port ticks, then each tick enriched: movement against the previous mid, a spread string", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.priceStream.price$(EURUSD));
        expect(c.values).toEqual([]);
        const first = createTick("EURUSD", 1.1);
        h.driver.tickPrice(first);
        h.driver.tickPrice(createTick("EURUSD", 1.2));
        h.driver.tickPrice(createTick("EURUSD", 1.15));
        await settle();
        expect(c.values.map((p) => [p.mid, p.movementType])).toEqual([
          [1.1, PriceMovementType.NONE],
          [1.2, PriceMovementType.UP],
          [1.15, PriceMovementType.DOWN],
        ]);
        expect(c.values[0].spread).toBe(
          calculateSpread(first.bid, first.ask, EURUSD.pipsPosition, EURUSD.ratePrecision),
        );
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber gets the current price synchronously", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.priceStream.price$(EURUSD));
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        const late = collect(h.app.presenters.priceStream.price$(EURUSD));
        expect(late.values.map(mid)).toEqual([1.1]);
        first.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("tears down on the last unsubscribe — the port is released, nothing stale is replayed, and the next period's first tick is NONE again", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.priceStream.price$(EURUSD));
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        expect(h.driver.priceObserved("EURUSD")).toBe(true);
        first.unsubscribe();
        await settle();
        expect(h.driver.priceObserved("EURUSD")).toBe(false);
        const again = collect(h.app.presenters.priceStream.price$(EURUSD));
        expect(again.values).toEqual([]);
        h.driver.tickPrice(createTick("EURUSD", 1.2));
        await settle();
        expect(again.values.map((p) => [p.mid, p.movementType])).toEqual([
          [1.2, PriceMovementType.NONE],
        ]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a failing feed errors the stream; a fresh subscriber starts a new period", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.priceStream.price$(EURUSD));
        h.driver.failPrice("EURUSD", new Error("feed"));
        await settle();
        expect(c.errors).toHaveLength(1);
        const again = collect(h.app.presenters.priceStream.price$(EURUSD));
        h.driver.tickPrice(createTick("EURUSD", 1.3));
        await settle();
        expect(again.values.map(mid)).toEqual([1.3]);
        expect(again.errors).toEqual([]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("while calm, delivers at most one price per PRICE_CONFLATION_MS: the first at once, the last of a burst at the window's end", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          h.app.presenters.powerSaver.setLevel("calm");
          await clock.settle();
          const c = collect(h.app.presenters.priceStream.price$(EURUSD));
          h.driver.tickPrice(createTick("EURUSD", 1.1));
          await clock.settle();
          expect(c.values.map(mid)).toEqual([1.1]);
          h.driver.tickPrice(createTick("EURUSD", 1.2));
          h.driver.tickPrice(createTick("EURUSD", 1.3));
          await clock.advance(PRICE_CONFLATION_MS - 1);
          expect(c.values.map(mid)).toEqual([1.1]);
          await clock.advance(1);
          await clock.settle();
          expect(c.values.map(mid)).toEqual([1.1, 1.3]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("while not calm, every tick passes through at once", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.priceStream.price$(EURUSD));
          h.driver.tickPrice(createTick("EURUSD", 1.1));
          h.driver.tickPrice(createTick("EURUSD", 1.2));
          h.driver.tickPrice(createTick("EURUSD", 1.3));
          await clock.settle();
          expect(c.values.map(mid)).toEqual([1.1, 1.2, 1.3]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("turning calm off takes effect immediately: the next tick passes without waiting for a window", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          h.app.presenters.powerSaver.setLevel("calm");
          await clock.settle();
          const c = collect(h.app.presenters.priceStream.price$(EURUSD));
          h.driver.tickPrice(createTick("EURUSD", 1.1));
          h.driver.tickPrice(createTick("EURUSD", 1.2));
          await clock.settle();
          expect(c.values.map(mid)).toEqual([1.1]);
          h.app.presenters.powerSaver.setLevel("off");
          await clock.settle();
          h.driver.tickPrice(createTick("EURUSD", 1.3));
          await clock.settle();
          // The pending trailing value (1.2) is uncontracted; 1.3 is not.
          expect(c.values.map(mid).at(-1)).toBe(1.3);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
```

Run: `pnpm --filter @rtc/core-contract build && pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts -t "priceStream"` → green on RxJS. (Until every suite file exists the package will not typecheck; create empty-`describe` stubs for the other ten first if you want to run one at a time, then fill them in.)

- [ ] **Step 3: `priceHistory`**

`packages/core-contract/src/suites/priceHistory.ts`:

```ts
import { describe, expect, it } from "vitest";

import { PRICE_HISTORY_CONFLATION_MS, PRICE_HISTORY_SIZE, type PriceTick } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createTick } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

function mids(window: readonly PriceTick[]): number[] {
  return window.map((tick) => {
    return tick.mid;
  });
}

export function describePriceHistoryContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("history$(symbol) is memoised per symbol", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.priceHistory;
        expect(p.history$("EURUSD")).toBe(p.history$("EURUSD"));
        expect(p.history$("EURUSD")).not.toBe(p.history$("GBPUSD"));
      } finally {
        await h.teardown();
      }
    });

    it("a never-mounted symbol has no synchronous value; ticks accumulate into a window capped at PRICE_HISTORY_SIZE", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.priceHistory.history$("EURUSD"));
        expect(c.values).toEqual([]);
        h.driver.tickPrice(createTick("EURUSD", 1));
        h.driver.tickPrice(createTick("EURUSD", 2));
        h.driver.tickPrice(createTick("EURUSD", 3));
        await settle();
        expect(c.values.map(mids)).toEqual([[1], [1, 2], [1, 2, 3]]);

        for (let i = 4; i <= PRICE_HISTORY_SIZE + 3; i += 1) {
          h.driver.tickPrice(createTick("EURUSD", i));
        }

        await settle();
        const last = c.values.at(-1);
        expect(last).toHaveLength(PRICE_HISTORY_SIZE);
        expect(mids(last ?? [])[0]).toBe(4);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("retains the window across a remount: the port is released on the last unsubscribe, and a resubscribe repaints the accumulated window synchronously", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.priceHistory.history$("EURUSD"));
        h.driver.tickPrice(createTick("EURUSD", 1));
        h.driver.tickPrice(createTick("EURUSD", 2));
        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.priceObserved("EURUSD")).toBe(false);
        const again = collect(h.app.presenters.priceHistory.history$("EURUSD"));
        expect(again.values.map(mids)).toEqual([[1, 2]]);
        h.driver.tickPrice(createTick("EURUSD", 3));
        await settle();
        expect(mids(again.values.at(-1) ?? [])).toEqual([1, 2, 3]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("while calm, delivers at most one window per PRICE_HISTORY_CONFLATION_MS — the last window of a burst, never an intermediate", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          h.app.presenters.powerSaver.setLevel("calm");
          await clock.settle();
          const c = collect(h.app.presenters.priceHistory.history$("EURUSD"));
          h.driver.tickPrice(createTick("EURUSD", 1));
          await clock.settle();
          expect(c.values.map(mids)).toEqual([[1]]);
          h.driver.tickPrice(createTick("EURUSD", 2));
          h.driver.tickPrice(createTick("EURUSD", 3));
          await clock.advance(PRICE_HISTORY_CONFLATION_MS - 1);
          expect(c.values.map(mids)).toEqual([[1]]);
          await clock.advance(1);
          await clock.settle();
          expect(c.values.map(mids)).toEqual([[1], [1, 2, 3]]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
```

- [ ] **Step 4: `currencyPairs` and `analytics`** (the two bare warm singletons)

`packages/core-contract/src/suites/currencyPairs.ts`:

```ts
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { EURUSD, GBPUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeCurrencyPairsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("pairs$ has no value until the roster arrives, then delivers the roster itself", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.currencyPairs.pairs$);
        expect(c.values).toEqual([]);
        const roster = [EURUSD, GBPUSD];
        h.driver.emitPairs(roster);
        await settle();
        expect(c.values).toHaveLength(1);
        expect(c.values[0]).toBe(roster);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("stays warm across zero subscribers: the port stays observed and a fresh subscriber replays the roster synchronously", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.currencyPairs.pairs$);
        h.driver.emitPairs([EURUSD]);
        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.pairsObserved()).toBe(true);
        const again = collect(h.app.presenters.currencyPairs.pairs$);
        expect(again.values).toEqual([[EURUSD]]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

`packages/core-contract/src/suites/analytics.ts` — identical shape over `h.app.presenters.analytics.position$`, `h.driver.emitPosition(createPositionUpdates(42))`, `h.driver.positionObserved()`; assert `c.values[0]` is the emitted object by reference and, in the warm case, `again.values[0].history[0].usdPnl` is `42`. Two cases, same names with "position$" in place of "pairs$" and "update" in place of "roster".

- [ ] **Step 5: `blotter`**

`packages/core-contract/src/suites/blotter.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ACTIVITY_FEED_CAP, DEFAULT_TRADER_NAME, type Trade } from "@rtc/domain";

import { collect } from "#/harness/collect";
import { createTrade } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

function createLiveTrade(tradeId: number): Trade {
  return createTrade({ tradeId, tradeName: DEFAULT_TRADER_NAME });
}

function ids(entries: readonly { readonly trade: Trade }[]): number[] {
  return entries.map((entry) => {
    return entry.trade.tradeId;
  });
}

export function describeBlotterContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("trades$ delivers each snapshot, replays the latest to a late subscriber synchronously, and stays warm across zero subscribers", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.blotter.trades$);
        expect(c.values).toEqual([]);
        const snapshot = [createTrade({ tradeId: 1 })];
        h.driver.emitTrades(snapshot);
        await settle();
        expect(c.values).toEqual([snapshot]);
        const late = collect(h.app.presenters.blotter.trades$);
        expect(late.values).toEqual([snapshot]);
        c.unsubscribe();
        late.unsubscribe();
        await settle();
        expect(h.driver.tradesObserved()).toBe(true);
      } finally {
        await h.teardown();
      }
    });

    it("newTradeIds$: the first snapshot marks nothing; ids appearing later are marked once, then cleared by the next snapshot", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.blotter.newTradeIds$);
        h.driver.emitTrades([createTrade({ tradeId: 1 })]);
        await settle();
        expect(c.values.map((set) => [...set])).toEqual([[]]);
        h.driver.emitTrades([createTrade({ tradeId: 1 }), createTrade({ tradeId: 2 })]);
        await settle();
        expect([...(c.values.at(-1) ?? [])]).toEqual([2]);
        h.driver.emitTrades([createTrade({ tradeId: 1 }), createTrade({ tradeId: 2 })]);
        await settle();
        expect([...(c.values.at(-1) ?? [])]).toEqual([]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("activity$ starts empty even when the first snapshot has live trades, lists later live trades newest first with a clock stamp, and never lists seeded rows", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.blotter.activity$);
        h.driver.emitTrades([createLiveTrade(1)]);
        await settle();
        expect(c.values.at(-1)).toEqual([]);
        h.driver.emitTrades([createLiveTrade(1), createTrade({ tradeId: 2 }), createLiveTrade(3)]);
        await settle();
        expect(ids(c.values.at(-1) ?? [])).toEqual([3]);
        expect(c.values.at(-1)?.[0].time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        h.driver.emitTrades([createLiveTrade(1), createTrade({ tradeId: 2 }), createLiveTrade(3), createLiveTrade(4)]);
        await settle();
        expect(ids(c.values.at(-1) ?? [])).toEqual([4, 3]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("activity$ caps at ACTIVITY_FEED_CAP, keeping the newest", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.blotter.activity$);
        h.driver.emitTrades([]);
        await settle();
        const burst = Array.from({ length: ACTIVITY_FEED_CAP + 5 }, (_, i) => {
          return createLiveTrade(i + 1);
        });
        h.driver.emitTrades(burst);
        await settle();
        const feed = ids(c.values.at(-1) ?? []);
        expect(feed).toHaveLength(ACTIVITY_FEED_CAP);
        expect(feed[0]).toBe(ACTIVITY_FEED_CAP + 5);
        expect(feed.at(-1)).toBe(6);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("activity$ survives zero subscribers: a resubscribe replays the accumulated feed synchronously and keeps accumulating", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.blotter.activity$);
        h.driver.emitTrades([]);
        h.driver.emitTrades([createLiveTrade(1)]);
        await settle();
        first.unsubscribe();
        await settle();
        const again = collect(h.app.presenters.blotter.activity$);
        expect(ids(again.values[0] ?? [])).toEqual([1]);
        h.driver.emitTrades([createLiveTrade(1), createLiveTrade(2)]);
        await settle();
        expect(ids(again.values.at(-1) ?? [])).toEqual([2, 1]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

(The `ids` parameter type is a named structural type in a parameter position — if `no-restricted-syntax` rejects the inline `{ readonly trade: Trade }[]`, type it as `readonly ActivityEntry[]` from `@rtc/core-api` instead.)

- [ ] **Step 6: `execution`**

`packages/core-contract/src/suites/execution.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Direction, ExecutionStatus, TradeStatus } from "@rtc/domain";

import { collect } from "#/harness/collect";
import { createPrice, createTrade, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeExecutionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("execute() is lazy — the port sees a request only once the result is subscribed — and the request carries ask for Buy, bid for Sell, the base currency as dealt", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.execution;
        const price = createPrice("EURUSD", 1.1);
        const buy = p.execute({ pair: EURUSD, direction: Direction.Buy, price, notional: 1_000_000 });
        expect(h.driver.pendingExecutions()).toEqual([]);
        const c = collect(buy);
        await settle();
        expect(h.driver.pendingExecutions()).toEqual([
          { currencyPair: "EURUSD", spotRate: price.ask, direction: Direction.Buy, notional: 1_000_000, dealtCurrency: "EUR" },
        ]);
        c.unsubscribe();
        await settle();
        expect(h.driver.pendingExecutions()).toEqual([]);
        const sell = collect(p.execute({ pair: EURUSD, direction: Direction.Sell, price, notional: 5 }));
        await settle();
        expect(h.driver.pendingExecutions()[0]?.spotRate).toBe(price.bid);
        sell.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a Done trade lands as the result and as an outcome on executions$", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.execution;
        const outcomes = collect(p.executions$);
        await settle();
        const c = collect(p.execute({ pair: EURUSD, direction: Direction.Buy, price: createPrice("EURUSD", 1.1), notional: 1 }));
        await settle();
        const trade = createTrade({ tradeId: 7, status: TradeStatus.Done });
        h.driver.resolveExecution(trade);
        await settle();
        expect(c.values).toEqual([{ trade, status: ExecutionStatus.Done }]);
        expect(c.errors).toEqual([]);
        expect(outcomes.values).toEqual([{ symbol: "EURUSD", status: ExecutionStatus.Done }]);
        c.unsubscribe();
        outcomes.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a Rejected trade lands as Rejected on both", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.execution;
        const outcomes = collect(p.executions$);
        await settle();
        const c = collect(p.execute({ pair: EURUSD, direction: Direction.Buy, price: createPrice("EURUSD", 1.1), notional: 1 }));
        await settle();
        h.driver.resolveExecution(createTrade({ status: TradeStatus.Rejected }));
        await settle();
        expect(c.values[0]?.status).toBe(ExecutionStatus.Rejected);
        expect(outcomes.values).toEqual([{ symbol: "EURUSD", status: ExecutionStatus.Rejected }]);
        c.unsubscribe();
        outcomes.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a failing execution errors the result; executions$ hears nothing", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.execution;
        const outcomes = collect(p.executions$);
        await settle();
        const c = collect(p.execute({ pair: EURUSD, direction: Direction.Buy, price: createPrice("EURUSD", 1.1), notional: 1 }));
        await settle();
        h.driver.failExecution(new Error("bust"));
        await settle();
        expect(c.errors).toHaveLength(1);
        expect(c.values).toEqual([]);
        expect(outcomes.values).toEqual([]);
        outcomes.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("executions$ does not replay: a subscriber joining after an outcome hears nothing", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.execution;
        const c = collect(p.execute({ pair: EURUSD, direction: Direction.Buy, price: createPrice("EURUSD", 1.1), notional: 1 }));
        await settle();
        h.driver.resolveExecution(createTrade());
        await settle();
        const late = collect(p.executions$);
        await settle();
        expect(late.values).toEqual([]);
        c.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

- [ ] **Step 7: `staleFlag` and `analyticsStaleFlag`**

`packages/core-contract/src/suites/staleFlag.ts`:

```ts
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { createTick, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeStaleFlagContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts false synchronously; the first CONNECTING → CONNECTED transition is a reconnect, stale until the first price", async () => {
      const h = makeHarness();
      const m = h.machines.staleFlag(EURUSD);

      try {
        const c = collect(m.state$);
        expect(c.values).toEqual([false]);
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        expect(c.values).toEqual([false, true]);
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        expect(c.values).toEqual([false, true, false]);
        h.driver.tickPrice(createTick("EURUSD", 1.2));
        h.driver.tickPrice(createTick("EURUSD", 1.3));
        await settle();
        expect(c.values).toEqual([false, true, false]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("goes stale on reconnect with no new price and clears on the next price; an idle disconnect counts as a disconnect", async () => {
      const h = makeHarness();
      const m = h.machines.staleFlag(EURUSD);

      try {
        const c = collect(m.state$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        expect(c.values.at(-1)).toBe(false);
        h.driver.emitConnection({ type: "gatewayDisconnected" });
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        expect(c.values.at(-1)).toBe(true);
        h.driver.tickPrice(createTick("EURUSD", 1.2));
        await settle();
        expect(c.values.at(-1)).toBe(false);
        h.driver.emitConnection({ type: "idleTimeout" });
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        expect(c.values.at(-1)).toBe(true);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("dispose() ends the fold: later events change nothing", async () => {
      const h = makeHarness();
      const m = h.machines.staleFlag(EURUSD);

      try {
        const c = collect(m.state$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        h.driver.tickPrice(createTick("EURUSD", 1.1));
        await settle();
        expect(c.values).toEqual([false, true, false]);
        m.dispose();
        h.driver.emitConnection({ type: "gatewayDisconnected" });
        h.driver.emitConnection({ type: "gatewayConnected" });
        await settle();
        expect(c.values).toEqual([false, true, false]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

`packages/core-contract/src/suites/analyticsStaleFlag.ts` — the same three cases over `h.machines.analyticsStaleFlag()` with `h.driver.emitPosition(createPositionUpdates(n))` in place of every `tickPrice` (distinct `n` per emission — each update is a new object, which is what the fold compares).

- [ ] **Step 8: `rowHighlight`**

`packages/core-contract/src/suites/rowHighlight.ts`:

```ts
import { describe, expect, it } from "vitest";

import { BLOTTER_ROW_HIGHLIGHT_MS } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeRowHighlightContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("a new row is true synchronously and flips to false at exactly BLOTTER_ROW_HIGHLIGHT_MS", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rowHighlight(true);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([true]);
          await clock.advance(BLOTTER_ROW_HIGHLIGHT_MS - 1);
          await clock.settle();
          expect(c.values).toEqual([true]);
          await clock.advance(1);
          await clock.settle();
          expect(c.values).toEqual([true, false]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a row that is not new is false and stays false", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rowHighlight(false);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([false]);
          await clock.advance(BLOTTER_ROW_HIGHLIGHT_MS);
          await clock.settle();
          expect(c.values).toEqual([false]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("dispose() before the timer fires keeps the highlight", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rowHighlight(true);

        try {
          const c = collect(m.state$);
          m.dispose();
          await clock.advance(BLOTTER_ROW_HIGHLIGHT_MS);
          await clock.settle();
          expect(c.values).toEqual([true]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
```

- [ ] **Step 9: `notional`**

`packages/core-contract/src/suites/notional.ts`:

```ts
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const INITIAL = {
  displayValue: "1,000,000",
  numericValue: 1_000_000,
  error: null,
  isRfq: false,
  isDefault: true,
};

export function describeNotionalContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts from the formatted default synchronously; a default above the RFQ threshold is flagged", async () => {
      const h = makeHarness();
      const m = h.machines.notional(1_000_000);
      const rfq = h.machines.notional(20_000_000);

      try {
        const c = collect(m.state$);
        expect(c.values).toEqual([INITIAL]);
        const r = collect(rfq.state$);
        expect(r.values[0]?.isRfq).toBe(true);
        expect(r.values[0]?.displayValue).toBe("20,000,000");
        c.unsubscribe();
        r.unsubscribe();
      } finally {
        m.dispose();
        rfq.dispose();
        await h.teardown();
      }
    });

    it("change() parses and reformats, expands k/m, marks the default, flags RFQ", async () => {
      const h = makeHarness();
      const m = h.machines.notional(1_000_000);

      try {
        const c = collect(m.state$);
        m.intents.change("2m");
        await settle();
        expect(c.values.at(-1)).toEqual({
          displayValue: "2,000,000",
          numericValue: 2_000_000,
          error: null,
          isRfq: false,
          isDefault: false,
        });
        m.intents.change("15m");
        await settle();
        expect(c.values.at(-1)?.isRfq).toBe(true);
        m.intents.change("500k");
        await settle();
        expect(c.values.at(-1)?.numericValue).toBe(500_000);
        m.intents.change("1m");
        await settle();
        expect(c.values.at(-1)?.isDefault).toBe(true);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("change() keeps the raw input with an error on a parse failure, and flags max exceeded while keeping the value", async () => {
      const h = makeHarness();
      const m = h.machines.notional(1_000_000);

      try {
        const c = collect(m.state$);
        m.intents.change("abc");
        await settle();
        expect(c.values.at(-1)).toEqual({
          displayValue: "abc",
          numericValue: 0,
          error: "Invalid input",
          isRfq: false,
          isDefault: false,
        });
        m.intents.change("2000m");
        await settle();
        expect(c.values.at(-1)?.error).toBe("Max exceeded");
        expect(c.values.at(-1)?.numericValue).toBe(2_000_000_000);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("reset() returns to the initial view; dispose() makes intents inert", async () => {
      const h = makeHarness();
      const m = h.machines.notional(1_000_000);

      try {
        const c = collect(m.state$);
        m.intents.change("2m");
        await settle();
        m.intents.reset();
        await settle();
        expect(c.values.at(-1)).toEqual(INITIAL);
        m.dispose();
        m.intents.change("3m");
        await settle();
        expect(c.values.at(-1)).toEqual(INITIAL);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

- [ ] **Step 10: `tileExecution`**

`packages/core-contract/src/suites/tileExecution.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { TileExecutionState } from "@rtc/core-api";
import {
  CONFIRMATION_DISMISS_MS,
  Direction,
  EXECUTION_TIMEOUT_MS,
  ExecutionStatus,
  TOO_LONG_THRESHOLD_MS,
  TradeStatus,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createPrice, createTrade, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";

const PRICE = createPrice("EURUSD", 1.1);

function statuses(values: readonly TileExecutionState[]): string[] {
  return values.map((state) => {
    return state.status;
  });
}

export function describeTileExecutionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts ready; execute() → started with one pending request; a Done result → finished{Done, trade}; ready again CONFIRMATION_DISMISS_MS later", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([{ status: "ready" }]);
          m.intents.execute(Direction.Buy, PRICE, 1_000_000);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready", "started"]);
          expect(h.driver.pendingExecutions()).toHaveLength(1);
          expect(h.driver.pendingExecutions()[0]?.currencyPair).toBe("EURUSD");
          const trade = createTrade({ tradeId: 9 });
          h.driver.resolveExecution(trade);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            status: "finished",
            executionStatus: ExecutionStatus.Done,
            trade,
          });
          await clock.advance(CONFIRMATION_DISMISS_MS - 1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("finished");
          await clock.advance(1);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready", "started", "finished", "ready"]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a Rejected trade lands as finished{Rejected}; a failing command as finished{Timeout} (not the timeout state)", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          h.driver.resolveExecution(createTrade({ status: TradeStatus.Rejected }));
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("finished");
          expect((c.values.at(-1) as { executionStatus: ExecutionStatus }).executionStatus).toBe(ExecutionStatus.Rejected);
          m.intents.dismiss();
          await clock.settle();
          m.intents.execute(Direction.Sell, PRICE, 1);
          await clock.settle();
          h.driver.failExecution(new Error("bust"));
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            status: "finished",
            executionStatus: ExecutionStatus.Timeout,
          });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("escalates to tooLong at TOO_LONG_THRESHOLD_MS, to timeout at EXECUTION_TIMEOUT_MS, then ready; a late result is dropped", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          await clock.advance(TOO_LONG_THRESHOLD_MS - 1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("started");
          await clock.advance(1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("tooLong");
          await clock.advance(EXECUTION_TIMEOUT_MS - TOO_LONG_THRESHOLD_MS);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("timeout");
          h.driver.resolveExecution(createTrade());
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("timeout");
          await clock.advance(CONFIRMATION_DISMISS_MS);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready", "started", "tooLong", "timeout", "ready"]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("finishing cancels the escalation: no tooLong after a result", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          h.driver.resolveExecution(createTrade());
          await clock.settle();
          await clock.advance(TOO_LONG_THRESHOLD_MS);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready", "started", "finished"]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("dismiss() returns to ready and cancels every pending timer; a fresh run works afterwards", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          m.intents.dismiss();
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready", "started", "ready"]);
          await clock.advance(EXECUTION_TIMEOUT_MS + CONFIRMATION_DISMISS_MS);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready", "started", "ready"]);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("started");
          h.driver.resolveExecution(createTrade());
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("finished");
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a new execute() supersedes the in-flight run: the first request is withdrawn, the second's result lands", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          m.intents.execute(Direction.Buy, PRICE, 2);
          await clock.settle();
          expect(h.driver.pendingExecutions().map((r) => r.notional)).toEqual([2]);
          const trade = createTrade({ notional: 2 });
          h.driver.resolveExecution(trade);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            status: "finished",
            executionStatus: ExecutionStatus.Done,
            trade,
          });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("dispose() makes intents inert", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.tileExecution(EURUSD);

        try {
          const c = collect(m.state$);
          m.dispose();
          m.intents.execute(Direction.Buy, PRICE, 1);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["ready"]);
          expect(h.driver.pendingExecutions()).toEqual([]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
```

(The `as { executionStatus: ExecutionStatus }` narrowing is a test-file cast; if lint objects, narrow with `if (last?.status === "finished") { expect(last.executionStatus)… } else { expect.fail(…) }`.)

- [ ] **Step 11: Port discipline for the three singletons**

Append inside `describePortDisciplineContract`'s `describe`, one case each for `currencyPairs` / `referenceData.getCurrencyPairs` / `pairs$`, `blotter` / `blotter.getTradeStream` / `trades$`, `analytics` / `analytics.getAnalytics` / `position$`:

```ts
    it("currencyPairs: subscribe, unsubscribe, subscribe again does not call referenceData.getCurrencyPairs() again", async () => {
      const h = makeHarness();
      const before = h.driver.portCalls("referenceData.getCurrencyPairs");
      // A zero baseline would mean the counted wrapper was bypassed or the
      // presenter was never constructed — the absence has to be visible.
      expect(before).toBeGreaterThan(0);

      try {
        const p = h.app.presenters.currencyPairs;
        const first = collect(p.pairs$);
        first.unsubscribe();
        await settle();
        const second = collect(p.pairs$);
        await settle();
        second.unsubscribe();
        expect(h.driver.portCalls("referenceData.getCurrencyPairs")).toBe(before);
      } finally {
        await h.teardown();
      }
    });
```

- [ ] **Step 12: Green on all three runners, then the PR A gate**

```bash
pnpm --filter @rtc/core-contract test
pnpm --filter @rtc/core-contract build
pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts
pnpm --filter @rtc/client-core-async exec vitest run src/coreContract.test.ts
pnpm --filter @rtc/client-core-effect exec vitest run src/coreContract.test.ts
```

Expected: every suite green on `rxjs`; green on `async` and `effect` too — trivially, the members still delegate (`pnpm core:parity` still prints 17/71). A red on RxJS is a suite that asserts something the RxJS core does not do: fix the SUITE unless the RxJS behaviour is a bug (then ledger it; RxJS changes are out of this slice). A red only on `async`/`effect` on a delegated member is impossible by construction — if it happens, the harness or the runner differs; investigate before anything else.

Then the local CI mirror for PR A:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm check:deps
pnpm --filter @rtc/tests gates
pnpm exec biome ci .
pnpm exec knip
```

Expected: all green (the "Alternative-core coverage gates" are unchanged by PR A — the runners gained cases over delegated members). `pnpm build` here is fine: Task 3 runs alone.

- [ ] **Step 13: Commit and ship PR A**

```bash
git add packages/core-contract
git commit -m "test(core-contract): slice 2 suites — priceStream, priceHistory, currencyPairs, blotter, analytics, execution, five machines; green on RxJS

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

Ship per the repo's shipping rules: push, open the PR (title `test(pluggable-core): slice 2 suites + harness; folds exported from client-core` — body: the eleven members, the harness verbs, the four constants moved, "no RxJS behaviour change: the 62 presenter/machine tests are the witness", `pnpm core:parity` still 17/71), loop until CI is green on the head SHA (all four required jobs), check CodeQL alerts, merge with `--merge`, confirm the merge commit is an ancestor of `origin/main`. Tasks 4–6 start in a NEW worktree off that `main`.

---

### Task 4: Async core — the eleven native members

**Files:**
- Modify: `packages/client-core-async/src/kernel/topic.ts` (`TopicOptions.retainUntil`; `mapTopic` over `relayTopic`)
- Create: `packages/client-core-async/src/kernel/relayTopic.ts`
- Modify: `packages/client-core-async/src/bridge/in.ts` (`once(source, signal?)`; `topicFromObservable(source, retainUntil?)`)
- Modify: `packages/client-core-async/src/bridge/out.ts` (`topicToStreamWithLead`, `promiseToStream`)
- Create: `packages/client-core-async/src/presenters/conflatedTopic.ts`, `priceStream.ts`, `priceHistory.ts`, `warmSingletons.ts`, `blotter.ts`, `execution.ts`
- Create: `packages/client-core-async/src/machines/notional.ts`, `rowHighlight.ts`, `staleFlag.ts`, `tileExecution.ts`
- Modify: `packages/client-core-async/src/composition.ts`, `src/parity.json`, `src/index.ts`, `README.md`
- Test: `src/kernel/topic.test.ts` (+3), `src/kernel/relayTopic.test.ts` (new), `src/bridge/in.test.ts` (+3), `src/bridge/out.test.ts` (+3), `src/presenters/conflatedTopic.test.ts`, `priceStream.test.ts`, `priceHistory.test.ts`, `warmSingletons.test.ts`, `blotter.test.ts`, `execution.test.ts`, `src/machines/{notional,rowHighlight,staleFlag,tileExecution}.test.ts`, `src/composition.machineFactories.test.ts`, `src/composition.dispose.test.ts` (all new)

**Interfaces:**
- Consumes: from `@rtc/client-core` (Task 1) — `createNewTradeScan`, `reduceNewTrades`, `createActivityScan`, `reduceActivity`, `createStaleFlagAcc`, `reduceStaleFlag`, `type StaleFlagEvent`, `createInitialNotionalView`, `reduceNotionalInput`, `READY_TILE_EXECUTION`, `STARTED_TILE_EXECUTION`, `TOO_LONG_TILE_EXECUTION`, `TIMEOUT_TILE_EXECUTION`, `TIMED_OUT_TILE_EXECUTION`, `finishedTileExecution`, `isTerminalTileExecution`. From `@rtc/domain` (Task 1) — the four constants; plus `PriceStreamUseCase`, `PriceHistoryUseCase`, `CurrencyPairsUseCase`, `TradeBlotterUseCase`, `AnalyticsUseCase`, `ExecuteTradeUseCase`, `TOO_LONG_THRESHOLD_MS`, `EXECUTION_TIMEOUT_MS`, `CONFIRMATION_DISMISS_MS`. The eleven suites (Task 3) through the runner.
- Produces: `createPriceStreamPresenter(pricing: PricingPort, isCalm$: Stream<boolean>): PriceStreamPresenter`; `createPriceHistoryPresenter(pricing, isCalm$): PriceHistoryPresenter`; `createCurrencyPairsPresenter(referenceData: ReferenceDataPort, lifetime: AbortSignal): CurrencyPairsPresenter`; `createAnalyticsPresenter(analytics: AnalyticsPort, lifetime: AbortSignal): AnalyticsPresenter`; `createBlotterPresenter(blotter: BlotterPort, lifetime: AbortSignal, now?: () => number): BlotterPresenter`; `createTradeExecutionPresenter(execution: ExecutionPort): TradeExecutionPresenter`; `createNotionalMachine(defaultNotional)`, `createRowHighlightMachine(isNew)`, `createStaleFlagMachine<T>(deps: StaleFlagDeps<T>)`, `createTileExecutionMachine(pair, deps: TileExecutionDeps)`; kernel `relayTopic(source: Topic<T>, signal: AbortSignal, next: (value: T) => void): Promise<void>`; bridge `once(source, signal?)`, `topicFromObservable(source, retainUntil?)`, `topicToStreamWithLead(topic, lead)`, `promiseToStream(run)`; `createConflatedTopic(source: Observable<T>, calm$: Stream<boolean>, ms: number): Topic<T>`.

Every test in this task lives in `src/**/*.test.ts` (vitest `include`), uses `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync` where a timer is involved, and a `setTimeout(resolve, 0)` tick otherwise (the package's existing idiom). Run tests with `pnpm --filter @rtc/client-core-async test`; build only this package (`pnpm --filter @rtc/client-core-async build`) — never a repo-wide build while Task 5 runs beside you.

- [ ] **Step 1: Failing kernel tests — `retainUntil` and `relayTopic`**

Append to `src/kernel/topic.test.ts` (inside the top-level `describe`):

```ts
  it("retainUntil: the producer outlives the last unsubscribe and is ended by the signal", async () => {
    const lifetime = new AbortController();
    let aborted = false;
    const topic = createTopic<number>(
      (signal, publish) => {
        publish(1);
        return new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        });
      },
      { replay: true, retainUntil: lifetime.signal },
    );
    const stop = topic.subscribe(() => {});
    stop();
    expect(aborted).toBe(false);
    // Still warm: a late subscriber gets the replayed value at once.
    const seen: number[] = [];
    const stopAgain = topic.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([1]);
    stopAgain();
    lifetime.abort();
    expect(aborted).toBe(true);
  });

  it("retainUntil: after the signal has aborted, a subscriber starts a fresh run rather than joining nothing", async () => {
    const lifetime = new AbortController();
    let runs = 0;
    const topic = createTopic<number>(
      async (signal, publish) => {
        runs += 1;
        publish(runs);
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            resolve();
          });
        });
      },
      { replay: true, retainUntil: lifetime.signal },
    );
    topic.subscribe(() => {})();
    lifetime.abort();
    const seen: number[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([2]);
    stop();
    // No signal left to retain it: the last unsubscribe ends this run.
    expect(runs).toBe(2);
  });

  it("mapTopic: a throwing projection fails the derived topic and releases the source (relayTopic)", async () => {
    const source = createTopic<number>((signal, publish) => {
      publish(1);
      return new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          resolve();
        });
      });
    }, { replay: true });
    const derived = mapTopic(source, () => {
      throw new Error("bad projection");
    });
    const errors: unknown[] = [];
    derived.subscribe(() => {}, (e) => {
      errors.push(e);
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(errors).toHaveLength(1);
  });
```

`src/kernel/relayTopic.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { relayTopic } from "#/kernel/relayTopic";
import { createTopic, type Topic } from "#/kernel/topic";

describe("relayTopic", () => {
  it("hands every value to next and stops SYNCHRONOUSLY on abort", async () => {
    const source = createHotTopic();
    const controller = new AbortController();
    const seen: number[] = [];
    const done = relayTopic(source, controller.signal, (v) => {
      seen.push(v);
    });
    source.publish(1);
    source.publish(2);
    expect(seen).toEqual([1, 2]);
    controller.abort();
    source.publish(3);
    expect(seen).toEqual([1, 2]);
    await done;
  });

  it("rejects when the source fails", async () => {
    const source = createHotTopic();
    const done = relayTopic(source, new AbortController().signal, () => {});
    source.fail(new Error("source"));
    await expect(done).rejects.toThrow("source");
  });

  it("rejects when next throws — including on a replayed value — and releases the source", async () => {
    const source = createTopic<number>(
      (signal, publish) => {
        publish(1);
        return new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            resolve();
          });
        });
      },
      { replay: true },
    );
    source.subscribe(() => {});
    const done = relayTopic(source, new AbortController().signal, () => {
      throw new Error("consumer");
    });
    await expect(done).rejects.toThrow("consumer");
  });

  it("resolves at once when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await relayTopic(createHotTopic(), controller.signal, () => {});
  });

  function createHotTopic(): Topic<number> {
    return createTopic<number>((signal) => {
      return new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          resolve();
        });
      });
    });
  }
});
```

Run: `pnpm --filter @rtc/client-core-async test` → FAIL (`retainUntil` unknown option; `#/kernel/relayTopic` missing).

- [ ] **Step 2: Kernel — `relayTopic`, `retainUntil`, `mapTopic`**

`src/kernel/relayTopic.ts`:

```ts
import type { Topic } from "#/kernel/topic";

/** Subscribe a Topic on behalf of a producer until `signal` aborts: every
 * value goes to `next`; the source failing, or `next` throwing, rejects —
 * a producer's own consumption of another topic is OPERATOR code, so its
 * failure fails the producer (`mapTopic`'s projection rule), never an
 * isolated report. Released SYNCHRONOUSLY on abort, matching the refCount
 * contract's own synchronous release — the `finally`-after-race shape is a
 * few microtasks late, late enough to fail a caller that checks release
 * state right after unsubscribing. Resolves on abort (that is a producer's
 * success, as `untilAborted` says). */
export function relayTopic<T>(
  source: Topic<T>,
  signal: AbortSignal,
  next: (value: T) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    // No initializer: an assignment target, not a function-expression
    // binding (`func-style`) — assigned synchronously below. A replayed
    // value can reach `fail` DURING `subscribe`, before this is set; the
    // `stop?.()` there is a no-op then and the `if (failed)` after the
    // subscribe call releases the source instead.
    let stop: (() => void) | undefined;
    let failed = false;

    function fail(error: unknown): void {
      failed = true;
      reject(error);
      stop?.();
    }

    stop = source.subscribe((value) => {
      try {
        next(value);
      } catch (error) {
        fail(error);
      }
    }, fail);

    if (failed) {
      stop();
      return;
    }

    signal.addEventListener(
      "abort",
      () => {
        stop?.();
        resolve();
      },
      { once: true },
    );
  });
}
```

(`topic.ts` imports `relayTopic` and `relayTopic.ts` imports a TYPE from `topic.ts`: a type-only cycle, which `verbatimModuleSyntax` erases; dependency-cruiser's `no-circular` counts type-only edges unless configured otherwise — if `pnpm check:deps` flags it, move the `Topic` interface into `src/kernel/topicTypes.ts` and re-export it from `topic.ts`.)

`src/kernel/topic.ts` — three edits:

1. `TopicOptions`:

```ts
export interface TopicOptions {
  /** Hand the most recent value to late subscribers (shareReplay bufferSize 1). */
  replay?: boolean;
  /** Keep the producer running across zero subscribers until this signal
   * aborts — the RxJS core's `warmReplay` (`shareReplay({ refCount: false
   * })`) for an app-lifetime singleton. The abort ends the run and forgets
   * the replayed value; subscribers attached at that moment hear nothing
   * more (silence after `dispose()` is the shared behaviour, §22), and a
   * later subscriber starts a fresh run. Failure still resets, as ever. */
  retainUntil?: AbortSignal;
}
```

2. In `createTopic`, after `let last`:

```ts
  function retained(): boolean {
    return options.retainUntil !== undefined && !options.retainUntil.aborted;
  }

  options.retainUntil?.addEventListener(
    "abort",
    () => {
      if (run !== null) {
        endRun(run);
      }
    },
    { once: true },
  );
```

and the unsubscribe closure becomes:

```ts
        return () => {
          subscribers.delete(subscriber);

          if (subscribers.size === 0 && run !== null && !retained()) {
            endRun(run);
          }
        };
```

3. `mapTopic` becomes:

```ts
/** A topic derived from another by a pure projection — `map` over a hot
 * source, keeping the replay-1 + refCount shape: the first subscriber here
 * subscribes the source (starting ITS producer if this is the source's first
 * subscriber too), the last unsubscribe releases it. A throwing projection
 * fails this topic, as rxjs's `map` does (`relayTopic`'s rule). */
export function mapTopic<T, U>(
  source: Topic<T>,
  project: (value: T) => U,
): Topic<U> {
  return createTopic<U>(
    (signal, publish) => {
      return relayTopic(source, signal, (value) => {
        publish(project(value));
      });
    },
    { replay: true },
  );
}
```

Update the `Topic` doc comment's last sentences to mention `retainUntil`. `themePreference.ts`'s hand-written `modePreference.subscribe` + `preferenceFailed` + abort-listener block is the same pattern: replace it with `relayTopic(modePreference, signal, (value) => { preference = value; resolve(); })` inside the `Promise.race` (drop `stop`, `preferenceFailed`, the listener and the `finally`) — the only behavioural difference is none; its tests stay green.

Run Step 1's tests → PASS. Existing `topic.test.ts`, `themePreference.test.ts` → still PASS.

- [ ] **Step 3: Failing bridge tests**

Append to `src/bridge/in.test.ts`:

```ts
  it("once(source, signal): abort rejects with AbortError and releases the source", async () => {
    const source = new Subject<number>();
    const controller = new AbortController();
    const pending = once(source, controller.signal);
    expect(source.observed).toBe(true);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AbortError);
    expect(source.observed).toBe(false);
  });

  it("once(source, signal): a value resolves and releases; an already-aborted signal rejects at once", async () => {
    const source = new Subject<number>();
    const pending = once(source, new AbortController().signal);
    source.next(7);
    expect(await pending).toBe(7);
    expect(source.observed).toBe(false);
    const aborted = new AbortController();
    aborted.abort();
    await expect(once(source, aborted.signal)).rejects.toBeInstanceOf(AbortError);
  });

  it("topicFromObservable(source, retainUntil): the port stays subscribed across zero subscribers and is released by the signal", () => {
    const source = new BehaviorSubject<number>(1);
    const lifetime = new AbortController();
    const topic = topicFromObservable(source, lifetime.signal);
    topic.subscribe(() => {})();
    expect(source.observed).toBe(true);
    lifetime.abort();
    expect(source.observed).toBe(false);
  });
```

Append to `src/bridge/out.test.ts`:

```ts
  it("topicToStreamWithLead hands each subscriber the lead value synchronously, before the topic's own", () => {
    const topic = createTopic<number>((signal, publish) => {
      publish(2);
      return new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          resolve();
        });
      });
    }, { replay: true });
    const stream = topicToStreamWithLead(topic, () => {
      return { value: 1 };
    });
    const seen: number[] = [];
    const sub = stream.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([1, 2]);
    sub.unsubscribe();
    const none = topicToStreamWithLead(topic, () => {
      return null;
    });
    const later: number[] = [];
    none.subscribe((v) => {
      later.push(v);
    }).unsubscribe();
    expect(later).toEqual([2]);
  });

  it("promiseToStream runs per subscription, emits the value and completes, and aborts on unsubscribe", async () => {
    let runs = 0;
    let abortedSignal: AbortSignal | undefined;
    const stream = promiseToStream<number>(async (signal) => {
      runs += 1;
      abortedSignal = signal;
      await sleep(10, signal);
      return runs;
    });
    expect(runs).toBe(0);
    const values: number[] = [];
    let completed = false;
    vi.useFakeTimers();
    stream.subscribe({ next: (v) => { values.push(v); }, complete: () => { completed = true; } });
    await vi.advanceTimersByTimeAsync(10);
    expect(values).toEqual([1]);
    expect(completed).toBe(true);
    const sub = stream.subscribe();
    sub.unsubscribe();
    expect(abortedSignal?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("promiseToStream errors the subscriber on a non-abort rejection and stays silent on an abort", async () => {
    const errors: unknown[] = [];
    promiseToStream(async () => {
      throw new Error("rpc");
    }).subscribe({ error: (e: unknown) => { errors.push(e); } });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(errors).toHaveLength(1);
    const silent: unknown[] = [];
    promiseToStream(async () => {
      throw new AbortError();
    }).subscribe({ error: (e: unknown) => { silent.push(e); }, complete: () => { silent.push("complete"); } });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(silent).toEqual([]);
  });
```

Add the imports each file needs (`AbortError` from `#/kernel/AbortError`, `createTopic` from `#/kernel/topic`, `sleep` from `#/kernel/sleep`, `vi` from vitest, `BehaviorSubject`/`Subject` from rxjs).

Run → FAIL.

- [ ] **Step 4: Bridge — `once` with a signal, retained `topicFromObservable`, the two new `out` shapes**

`src/bridge/in.ts` — replace `once` and `topicFromObservable`:

```ts
/** One-shot RPC shape: the first value of an Observable port method. With a
 * `signal`, an abort releases the subscription and rejects with `AbortError`
 * (the kernel's "normal" rejection, which `spawn` swallows) — how a
 * superseded or dismissed tile execution lets go of its in-flight port
 * call. A source that completes without a value rejects, as
 * `firstValueFrom` does. */
export function once<T>(source: Observable<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) {
    return firstValueFrom(source);
  }

  if (signal.aborted) {
    return Promise.reject(new AbortError());
  }

  return new Promise<T>((resolve, reject) => {
    const subscription = source.pipe(take(1)).subscribe({
      next: resolve,
      error: reject,
      complete: () => {
        reject(new Error("once: source completed without a value"));
      },
    });
    signal.addEventListener(
      "abort",
      () => {
        subscription.unsubscribe();
        reject(new AbortError());
      },
      { once: true },
    );
  });
}

/** A hot port Observable as a replay-1, refCounted Topic: the port is
 * subscribed on the topic's first subscriber and released on its last — the
 * RxJS core's `port$().pipe(shareReplay({ bufferSize: 1, refCount: true }))`,
 * as a Topic whose whole producer is one `relay`. With `retainUntil`, the
 * release waits for that signal instead of the last unsubscribe — the RxJS
 * core's `warmReplay()` (`refCount: false`), for the session singletons. */
export function topicFromObservable<T>(
  source: Observable<T>,
  retainUntil?: AbortSignal,
): Topic<T> {
  return createTopic<T>(
    (signal, publish) => {
      return relay(source, signal, publish);
    },
    { replay: true, retainUntil },
  );
}
```

(`take` and `firstValueFrom` from `rxjs`; `AbortError` from `#/kernel/AbortError`. `subscribe` with `next: resolve` — resolve's second parameter is unused; if `rtc/name-functions-by-effect` or Biome objects to passing `resolve` bare, wrap: `next: (value: T) => { resolve(value); }`.)

`src/bridge/out.ts` — replace `topicToStream` and add two functions:

```ts
/** The only places in this package that construct an rxjs Observable.
 * Everything upstream is Topics, Stores, Promises and AsyncIterables. */
export function topicToStream<T>(topic: Topic<T>): Stream<T> {
  return topicToStreamWithLead(topic, () => {
    return null;
  });
}

/** `topicToStream` that first hands each subscriber `lead()`'s value
 * synchronously, when there is one, ahead of the topic's own replay or
 * first value — the RxJS core's `defer(() => shared.pipe(startWith(seed)))`
 * for a remounted price-history window: the retained window paints on the
 * first frame, then the topic continues. A warm topic follows with its
 * replayed value; nothing de-duplicates the two, as nothing does in the
 * RxJS core. */
export function topicToStreamWithLead<T>(
  topic: Topic<T>,
  lead: () => Peeked<T> | null,
): Stream<T> {
  return new Observable<T>((subscriber) => {
    const first = lead();

    if (first !== null) {
      subscriber.next(first.value);
    }

    return topic.subscribe(
      (value) => {
        subscriber.next(value);
      },
      (error) => {
        subscriber.error(error);
      },
    );
  });
}

/** A one-shot command result as a Stream: `run` starts on each subscribe
 * with a signal the unsubscribe aborts; its value is emitted and the stream
 * completes (an RPC result ends — slice 2 ruling 11); a rejection errors the
 * subscriber unless it is the abort itself, which is silence. */
export function promiseToStream<T>(
  run: (signal: AbortSignal) => Promise<T>,
): Stream<T> {
  return new Observable<T>((subscriber) => {
    const controller = new AbortController();
    run(controller.signal).then(
      (value) => {
        subscriber.next(value);
        subscriber.complete();
      },
      (error: unknown) => {
        if (!(error instanceof AbortError)) {
          subscriber.error(error);
        }
      },
    );

    return () => {
      controller.abort();
    };
  });
}
```

(`Peeked` from `#/bridge/in`; `AbortError` from `#/kernel/AbortError`.) Run Step 3's tests → PASS; every existing bridge test → PASS.

- [ ] **Step 5: `createConflatedTopic` — failing test, then the producer**

`src/presenters/conflatedTopic.test.ts`:

```ts
import { BehaviorSubject, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createConflatedTopic } from "#/presenters/conflatedTopic";

describe("createConflatedTopic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("while calm: leading value at once, the last of a burst at the window's end, then a new window", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(true);
    const topic = createConflatedTopic(source, calm, 100);
    const seen: number[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    source.next(1);
    source.next(2);
    source.next(3);
    expect(seen).toEqual([1]);
    await vi.advanceTimersByTimeAsync(99);
    expect(seen).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual([1, 3]);
    // The trailing emission opened a new window: a value now waits again.
    source.next(4);
    expect(seen).toEqual([1, 3]);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual([1, 3, 4]);
    stop();
  });

  it("while not calm: every value passes at once; values before the flag has spoken are dropped", () => {
    const source = new Subject<number>();
    const calm = new Subject<boolean>();
    const topic = createConflatedTopic(source, calm, 100);
    const seen: number[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    source.next(0);
    expect(seen).toEqual([]);
    calm.next(false);
    source.next(1);
    source.next(2);
    expect(seen).toEqual([1, 2]);
    stop();
  });

  it("calm → off drops the open window and its pending value; off → calm starts fresh with a leading value", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(true);
    const topic = createConflatedTopic(source, calm, 100);
    const seen: number[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    source.next(1);
    source.next(2);
    calm.next(false);
    source.next(3);
    expect(seen).toEqual([1, 3]);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual([1, 3]);
    calm.next(true);
    source.next(4);
    source.next(5);
    expect(seen).toEqual([1, 3, 4]);
    stop();
  });

  it("the last unsubscribe closes the window: nothing is published afterwards, both sources are released", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(true);
    const topic = createConflatedTopic(source, calm, 100);
    const seen: number[] = [];
    const stop = topic.subscribe((v) => {
      seen.push(v);
    });
    source.next(1);
    source.next(2);
    stop();
    expect(source.observed).toBe(false);
    expect(calm.observed).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual([1]);
  });

  it("a source failure fails the topic", async () => {
    const source = new Subject<number>();
    const topic = createConflatedTopic(source, new BehaviorSubject<boolean>(false), 100);
    const errors: unknown[] = [];
    topic.subscribe(() => {}, (e) => {
      errors.push(e);
    });
    source.error(new Error("feed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveLength(1);
  });
});
```

`src/presenters/conflatedTopic.ts`:

```ts
import type { Observable } from "rxjs";

import type { Stream } from "@rtc/core-api";

import { relay } from "#/bridge/in";
import { sleep } from "#/kernel/sleep";
import { createTopic, type Topic } from "#/kernel/topic";

/** A value waiting for the window's end, boxed so `null` means "nothing
 * pending" even for a source that emits `null`. */
interface Pending<T> {
  readonly value: T;
}

/** The RxJS core's `conflateWhen(flag$, ms)` restated as one producer: a
 * leading+trailing throttle gated by the calm flag. While calm, a value
 * arriving with no window open is published at once and opens a window of
 * `ms`; values inside the window replace a pending slot; at the window's end
 * the pending value (if any) is published and a new window opens — so a
 * steady feed yields one value per `ms`. While not calm, every value passes.
 * A flag flip takes effect at once: calm → off closes the window and drops
 * its pending value (the RxJS `switchMap` unsubscribes the throttled inner);
 * off → calm starts fresh. Values before the flag has emitted are dropped
 * (there is no inner yet). Replay-1 + refCount, like every presenter
 * stream; the window timer dies with the run. */
export function createConflatedTopic<T>(
  source: Observable<T>,
  calm$: Stream<boolean>,
  ms: number,
): Topic<T> {
  return createTopic<T>(
    async (signal, publish) => {
      let calm: boolean | null = null;
      let pending: Pending<T> | null = null;
      let window: AbortController | null = null;

      function closeWindow(): void {
        window?.abort();
        window = null;
        pending = null;
      }

      function openWindow(): void {
        const controller = new AbortController();
        window = controller;
        void sleep(ms, controller.signal).then(
          () => {
            if (window !== controller) {
              return;
            }

            window = null;

            if (pending !== null) {
              const { value } = pending;
              pending = null;
              publish(value);
              openWindow();
            }
          },
          () => {
            // A closed window is silent: its abort is the normal end.
          },
        );
      }

      signal.addEventListener("abort", closeWindow, { once: true });

      await Promise.race([
        relay(calm$, signal, (on) => {
          calm = on;

          if (!on) {
            closeWindow();
          }
        }),
        relay(source, signal, (value) => {
          if (calm === null) {
            return;
          }

          if (!calm) {
            publish(value);
            return;
          }

          if (window === null) {
            publish(value);
            openWindow();
            return;
          }

          pending = { value };
        }),
      ]);
    },
    { replay: true },
  );
}
```

Run → PASS.

- [ ] **Step 6: Presenters — failing tests**

`src/presenters/priceStream.test.ts`:

```ts
import { BehaviorSubject, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { KNOWN_CURRENCY_PAIRS, type PriceTick, type PricingPort } from "@rtc/domain";

import { createPriceStreamPresenter } from "#/presenters/priceStream";

const EURUSD = KNOWN_CURRENCY_PAIRS[0];

describe("createPriceStreamPresenter (async)", () => {
  it("opens the port stream per warm period through the use case, never at construction, and memoises per pair", () => {
    const { port, calls, ticks } = createPort();
    const presenter = createPriceStreamPresenter(port, new BehaviorSubject<boolean>(false));
    expect(calls).toEqual([]);
    const stream = presenter.price$(EURUSD);
    expect(presenter.price$(EURUSD)).toBe(stream);
    expect(calls).toEqual([]);
    const first = stream.subscribe(() => {});
    expect(calls).toEqual(["EURUSD"]);
    first.unsubscribe();
    expect(ticks.observed).toBe(false);
    stream.subscribe(() => {}).unsubscribe();
    expect(calls).toEqual(["EURUSD", "EURUSD"]);
  });

  function createPort(): { port: PricingPort; calls: string[]; ticks: Subject<PriceTick> } {
    const calls: string[] = [];
    const ticks = new Subject<PriceTick>();
    const port: PricingPort = {
      getPriceUpdates: (symbol: string) => {
        calls.push(symbol);
        return ticks;
      },
      getPriceHistory: () => {
        throw new Error("unused");
      },
      getRfqQuote: () => {
        throw new Error("unused");
      },
    };
    return { port, calls, ticks };
  }
});
```

(Name the return shape: `interface PortFixture { port: PricingPort; calls: string[]; ticks: Subject<PriceTick> }` — inline object return types are banned.)

`src/presenters/priceHistory.test.ts` — two cases: "the retained window is handed to a resubscriber synchronously and keeps accumulating into the same window" (subscribe, two ticks, unsubscribe, resubscribe → first value has both mids; third tick → three) and "a never-mounted symbol has no lead" (subscribe → nothing synchronous). Use the same `createPort` shape, calm `BehaviorSubject(false)`.

`src/presenters/warmSingletons.test.ts` — for `createCurrencyPairsPresenter` and `createAnalyticsPresenter`: "calls the port once at construction; holds the subscription across zero subscribers; releases it when the lifetime aborts" (a `Subject` port, `calls` counter, `observed` before/after `lifetime.abort()`).

`src/presenters/blotter.test.ts` — "activity$ keeps its accumulator across zero subscribers and stamps entries with the injected clock" (pass `now: () => Date.UTC(2026, 0, 1, 10, 20, 30)`; assert `time` equals `formatClockTime(...)` from `@rtc/client-core`); "newTradeIds$ restarts its scan per warm period: after a resubscribe the current snapshot marks nothing".

`src/presenters/execution.test.ts` — "execute() subscribes the port only when its result is subscribed, and unsubscribing aborts the call" (a port returning a `Subject<Trade>`; `observed` flips with subscribe/unsubscribe); "executions$ reaches only subscribers present at publish time" (no subscriber → publish dropped; late subscriber hears nothing).

Run → FAIL (modules missing).

- [ ] **Step 7: The six presenters**

`src/presenters/priceStream.ts`:

```ts
import type { PriceStreamPresenter, Stream } from "@rtc/core-api";
import {
  type CurrencyPair,
  type Price,
  PRICE_CONFLATION_MS,
  PriceStreamUseCase,
  type PricingPort,
} from "@rtc/domain";

import { topicToStream } from "#/bridge/out";
import { createConflatedTopic } from "#/presenters/conflatedTopic";

/** Per-pair live prices, memoised per symbol so `price$(EURUSD) ===
 * price$(EURUSD)`. Each stream is one conflated Topic over the domain use
 * case's Observable: `execute(pair)` is a `defer`, so the PORT is subscribed
 * per warm period (the RxJS core's shape — enrichment state restarts with
 * the period) and never here. `isCalm$` gates the conflation. */
export function createPriceStreamPresenter(
  pricing: PricingPort,
  isCalm$: Stream<boolean>,
): PriceStreamPresenter {
  const useCase = new PriceStreamUseCase(pricing);
  const cache = new Map<string, Stream<Price>>();

  return {
    price$: (pair: CurrencyPair) => {
      const cached = cache.get(pair.symbol);

      if (cached !== undefined) {
        return cached;
      }

      const stream = topicToStream(
        createConflatedTopic(useCase.execute(pair), isCalm$, PRICE_CONFLATION_MS),
      );
      cache.set(pair.symbol, stream);
      return stream;
    },
  };
}
```

`src/presenters/priceHistory.ts`:

```ts
import type { PriceHistoryPresenter, Stream } from "@rtc/core-api";
import {
  PRICE_HISTORY_CONFLATION_MS,
  PriceHistoryUseCase,
  type PriceTick,
  type PricingPort,
} from "@rtc/domain";

import { topicToStreamWithLead } from "#/bridge/out";
import { createConflatedTopic } from "#/presenters/conflatedTopic";

/** Per-symbol rolling windows. The window ARRAY is owned here and outlives
 * any subscription: the use case pushes into it, the Topic releases the
 * port on the last unsubscribe (per-symbol streams must), and a remount
 * repaints the accumulated window synchronously through the stream's
 * `lead` before the topic's own values — the RxJS core's
 * `defer(() => shared.pipe(startWith(seed)))`. A never-mounted symbol has an
 * empty window and no lead. */
export function createPriceHistoryPresenter(
  pricing: PricingPort,
  isCalm$: Stream<boolean>,
): PriceHistoryPresenter {
  const useCase = new PriceHistoryUseCase(pricing);
  const cache = new Map<string, Stream<readonly PriceTick[]>>();
  const windows = new Map<string, PriceTick[]>();

  return {
    history$: (symbol: string) => {
      const cached = cache.get(symbol);

      if (cached !== undefined) {
        return cached;
      }

      const retained: PriceTick[] = [];
      windows.set(symbol, retained);
      const stream = topicToStreamWithLead(
        createConflatedTopic(
          useCase.execute(symbol, retained),
          isCalm$,
          PRICE_HISTORY_CONFLATION_MS,
        ),
        () => {
          return retained.length === 0 ? null : { value: [...retained] };
        },
      );
      cache.set(symbol, stream);
      return stream;
    },
  };
}
```

(`windows` exists so the retained arrays are reachable by name for a debugger and a test; if knip or Biome flags it as write-only, drop the map and keep `retained` closed over — the behaviour is identical.)

`src/presenters/warmSingletons.ts`:

```ts
import type { AnalyticsPresenter, CurrencyPairsPresenter } from "@rtc/core-api";
import {
  type AnalyticsPort,
  AnalyticsUseCase,
  CurrencyPairsUseCase,
  type ReferenceDataPort,
} from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";

/** The currency-pair roster: replay-current and kept warm for the session —
 * the port is subscribed on the first subscriber and released only when
 * `lifetime` aborts (`app.dispose()`), the RxJS core's `warmReplay()`. The
 * port method is called ONCE, here. */
export function createCurrencyPairsPresenter(
  referenceData: ReferenceDataPort,
  lifetime: AbortSignal,
): CurrencyPairsPresenter {
  const source = new CurrencyPairsUseCase(referenceData).execute();

  return { pairs$: topicToStream(topicFromObservable(source, lifetime)) };
}

/** The analytics position stream — same warm-singleton shape. */
export function createAnalyticsPresenter(
  analytics: AnalyticsPort,
  lifetime: AbortSignal,
): AnalyticsPresenter {
  const source = new AnalyticsUseCase(analytics).execute();

  return { position$: topicToStream(topicFromObservable(source, lifetime)) };
}
```

`src/presenters/blotter.ts`:

```ts
import {
  createActivityScan,
  createNewTradeScan,
  reduceActivity,
  reduceNewTrades,
} from "@rtc/client-core";
import type { ActivityEntry, BlotterPresenter } from "@rtc/core-api";
import { type BlotterPort, TradeBlotterUseCase } from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { relayTopic } from "#/kernel/relayTopic";
import { createTopic } from "#/kernel/topic";

/** `trades$` is the warm singleton (retained until `lifetime` aborts).
 * `newTradeIds$` is a refCounted fold over it — its scan state is
 * producer-local, so a fresh warm period restarts from "nothing seen" and
 * the current snapshot marks nothing, as the RxJS `scan` under a
 * refCounted `shareReplay` does. `activity$` is the same fold shape but
 * RETAINED: the feed accumulates for the session and survives every
 * unmount. Both folds are the reducers the RxJS core runs, imported. `now`
 * is injectable so a test can pin the clock stamp. */
export function createBlotterPresenter(
  blotter: BlotterPort,
  lifetime: AbortSignal,
  now: () => number = Date.now,
): BlotterPresenter {
  // Called ONCE, here.
  const source = new TradeBlotterUseCase(blotter).execute();
  const trades = topicFromObservable(source, lifetime);

  const newTradeIds = createTopic<ReadonlySet<number>>(
    (signal, publish) => {
      let scan = createNewTradeScan();
      return relayTopic(trades, signal, (snapshot) => {
        scan = reduceNewTrades(scan, snapshot);
        publish(scan.fresh);
      });
    },
    { replay: true },
  );

  const activity = createTopic<readonly ActivityEntry[]>(
    (signal, publish) => {
      let scan = createActivityScan();
      return relayTopic(trades, signal, (snapshot) => {
        scan = reduceActivity(scan, snapshot, now());
        publish(scan.entries);
      });
    },
    { replay: true, retainUntil: lifetime },
  );

  return {
    trades$: topicToStream(trades),
    newTradeIds$: topicToStream(newTradeIds),
    activity$: topicToStream(activity),
  };
}
```

`src/presenters/execution.ts`:

```ts
import type { ExecutionOutcome, TradeExecutionPresenter } from "@rtc/core-api";
import {
  type ExecuteTradeInput,
  ExecuteTradeUseCase,
  type ExecutionPort,
} from "@rtc/domain";

import { once } from "#/bridge/in";
import { promiseToStream, topicToStream } from "#/bridge/out";
import { createTopic } from "#/kernel/topic";
import { untilAborted } from "#/kernel/untilAborted";

/** `executions$` is hot with no replay — the RxJS `Subject`: a Topic whose
 * producer has no work of its own, so `publish` reaches exactly the
 * subscribers present at that moment and nobody when there are none.
 * `execute(input)` is a one-shot command: nothing happens until the returned
 * stream is subscribed; then the use case runs, the outcome is published,
 * and the stream emits the result and completes. Unsubscribing aborts the
 * in-flight port call. */
export function createTradeExecutionPresenter(
  execution: ExecutionPort,
): TradeExecutionPresenter {
  const useCase = new ExecuteTradeUseCase(execution);
  const outcomes = createTopic<ExecutionOutcome>((signal) => {
    return untilAborted(signal);
  });

  return {
    executions$: topicToStream(outcomes),
    execute: (input: ExecuteTradeInput) => {
      return promiseToStream(async (signal) => {
        const result = await once(useCase.execute(input), signal);
        outcomes.publish({ symbol: input.pair.symbol, status: result.status });
        return result;
      });
    },
  };
}
```

Run Step 6's tests → PASS.

- [ ] **Step 8: Machines — failing tests, then the four files**

`src/machines/notional.test.ts` — three cases, all synchronous reads through `state$`: "starts from the initial view and change()/reset() drive it", "an equal view is not re-published" (change("1m") twice → one emission after the initial — `Store` drops `Object.is`-equal writes: the views are NEW objects each time, so this case asserts the OPPOSITE: two emissions; write the case as "each change publishes a fresh view"), "dispose() makes intents inert".

`src/machines/rowHighlight.test.ts` — fake timers: "true then false at exactly BLOTTER_ROW_HIGHLIGHT_MS", "false stays false", "dispose() before the timer keeps true".

`src/machines/staleFlag.test.ts` — real timers: "folds status and value through reduceStaleFlag and drops equal states" (a `Subject<ConnectionStatus>` and a `Subject<object>`; assert `[false, true, false]`), "dispose() releases both sources", "a source failure aborts the machine and is rethrown on a macrotask" (spy `setTimeout`? simpler: `vi.useFakeTimers()`, error the value source, `expect(() => vi.runAllTimers()).toThrow("feed")`, and both sources released).

`src/machines/tileExecution.test.ts` — fake timers; `deps.execute` returns a `Subject<ExecuteTradeResult>` per call recorded in an array: "ready → started (sync) → finished → ready after CONFIRMATION_DISMISS_MS", "tooLong at TOO_LONG_THRESHOLD_MS, timeout at EXECUTION_TIMEOUT_MS, late result ignored", "a failing command → finished{Timeout}", "dismiss() aborts the in-flight call (subject unobserved) and returns to ready", "a second execute() aborts the first call", "dispose() aborts and inert intents".

Then the machines:

`src/machines/notional.ts`:

```ts
import { createInitialNotionalView, reduceNotionalInput } from "@rtc/client-core";
import type { Machine, NotionalIntents, NotionalView } from "@rtc/core-api";

import { storeToStateStream } from "#/bridge/out";
import { createStore } from "#/kernel/store";

/** A Store plus two intents; the view math is the RxJS core's, imported.
 * `dispose()` makes the intents inert — there is nothing warm to end. */
export function createNotionalMachine(
  defaultNotional: number,
): Machine<NotionalView, NotionalIntents> {
  const initial = createInitialNotionalView(defaultNotional);
  const store = createStore<NotionalView>(initial);
  let disposed = false;

  return {
    state$: storeToStateStream(store),
    intents: {
      change: (input: string) => {
        if (!disposed) {
          store.set(reduceNotionalInput(defaultNotional, input));
        }
      },
      reset: () => {
        if (!disposed) {
          store.set(initial);
        }
      },
    },
    dispose: () => {
      disposed = true;
    },
  };
}
```

`src/machines/rowHighlight.ts`:

```ts
import type { ReadOnlyMachine } from "@rtc/core-api";
import { BLOTTER_ROW_HIGHLIGHT_MS } from "@rtc/domain";

import { storeToStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

/** `isNew` at once, then `false` after `BLOTTER_ROW_HIGHLIGHT_MS`; a row that
 * is not new never changes. `dispose()` aborts the timer — an aborted sleep
 * is the normal end `spawn` swallows. */
export function createRowHighlightMachine(isNew: boolean): ReadOnlyMachine<boolean> {
  const store = createStore(isNew);
  const controller = new AbortController();

  if (isNew) {
    void spawn(async () => {
      await sleep(BLOTTER_ROW_HIGHLIGHT_MS, controller.signal);
      store.set(false);
    }, reportAsync);
  }

  return {
    state$: storeToStateStream(store),
    intents: {},
    dispose: () => {
      controller.abort();
    },
  };
}
```

`src/machines/staleFlag.ts`:

```ts
import {
  createStaleFlagAcc,
  reduceStaleFlag,
  type StaleFlagEvent,
} from "@rtc/client-core";
import type { ReadOnlyMachine, Stream } from "@rtc/core-api";
import type { ConnectionStatus } from "@rtc/domain";

import { relay } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

export interface StaleFlagDeps<T> {
  status$: Stream<ConnectionStatus>;
  value$: Stream<T>;
}

/** The stale-flag fold (the RxJS core's reducer, imported) over a Store:
 * warm from creation — both sources are relayed at once, as the RxJS
 * `state$.subscribe()` does — and ended by `dispose()`. The Store's
 * equal-write drop is the `distinctUntilChanged`. A source failure has no
 * channel on a Store: it aborts the machine and is rethrown on a macrotask
 * (slice 2 ruling 8). */
export function createStaleFlagMachine<T>(
  deps: StaleFlagDeps<T>,
): ReadOnlyMachine<boolean> {
  const store = createStore(false);
  const controller = new AbortController();
  let acc = createStaleFlagAcc<T>();

  function apply(event: StaleFlagEvent<T>): void {
    acc = reduceStaleFlag(acc, event);
    store.set(acc.stale);
  }

  void spawn(async () => {
    try {
      await Promise.all([
        relay(deps.status$, controller.signal, (status) => {
          apply({ kind: "status", status });
        }),
        relay(deps.value$, controller.signal, (value) => {
          apply({ kind: "value", value });
        }),
      ]);
    } catch (error) {
      controller.abort();
      throw error;
    }
  }, reportAsync);

  return {
    state$: storeToStateStream(store),
    intents: {},
    dispose: () => {
      controller.abort();
    },
  };
}
```

`src/machines/tileExecution.ts`:

```ts
import {
  finishedTileExecution,
  isTerminalTileExecution,
  READY_TILE_EXECUTION,
  STARTED_TILE_EXECUTION,
  TIMED_OUT_TILE_EXECUTION,
  TIMEOUT_TILE_EXECUTION,
  TOO_LONG_TILE_EXECUTION,
} from "@rtc/client-core";
import type {
  Machine,
  Stream,
  TileExecutionIntents,
  TileExecutionState,
} from "@rtc/core-api";
import {
  CONFIRMATION_DISMISS_MS,
  type CurrencyPair,
  type Direction,
  EXECUTION_TIMEOUT_MS,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  type Price,
  TOO_LONG_THRESHOLD_MS,
} from "@rtc/domain";

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

export interface TileExecutionDeps {
  /** The execute command (`TradeExecutionPresenter.execute`), injected so
   * timing is controllable in tests. */
  execute: (input: ExecuteTradeInput) => Stream<ExecuteTradeResult>;
}

/** The spec's sketch, verbatim in shape: one `run` per `execute()`, cancelled
 * by the next `execute()` (`switchMap`), by `dismiss()` (`takeUntil`) and by
 * `dispose()` — all three abort the run's controller, which ends its sleeps
 * and releases the in-flight port call through `once`'s signal. The
 * too-long marker is a forked sleep that does nothing once the state is
 * terminal; the outcome is a race between the command and the timeout; a
 * failing command is `finished{Timeout}`, not the `timeout` state; the
 * confirmation dismisses itself after `CONFIRMATION_DISMISS_MS`. A result
 * landing after the timeout won is ignored by the race. */
export function createTileExecutionMachine(
  pair: CurrencyPair,
  deps: TileExecutionDeps,
): Machine<TileExecutionState, TileExecutionIntents> {
  const store = createStore<TileExecutionState>(READY_TILE_EXECUTION);
  let active: AbortController | null = null;
  let disposed = false;

  function endActive(): void {
    active?.abort();
    active = null;
  }

  async function run(input: ExecuteTradeInput, signal: AbortSignal): Promise<void> {
    store.set(STARTED_TILE_EXECUTION);
    void sleep(TOO_LONG_THRESHOLD_MS, signal).then(
      () => {
        store.set((current) => {
          return isTerminalTileExecution(current) ? current : TOO_LONG_TILE_EXECUTION;
        });
      },
      () => {
        // Aborted: the run ended first.
      },
    );
    const outcome = await Promise.race([
      once(deps.execute(input), signal).then(finishedTileExecution, (error: unknown) => {
        if (error instanceof AbortError) {
          throw error;
        }

        return TIMED_OUT_TILE_EXECUTION;
      }),
      sleep(EXECUTION_TIMEOUT_MS, signal).then(() => {
        return TIMEOUT_TILE_EXECUTION;
      }),
    ]);
    store.set(outcome);
    await sleep(CONFIRMATION_DISMISS_MS, signal);
    store.set(READY_TILE_EXECUTION);
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      execute: (direction: Direction, price: Price, notional: number) => {
        if (disposed) {
          return;
        }

        endActive();
        const controller = new AbortController();
        active = controller;
        void spawn(() => {
          return run({ pair, direction, price, notional }, controller.signal);
        }, reportAsync);
      },
      dismiss: () => {
        if (disposed) {
          return;
        }

        endActive();
        store.set(READY_TILE_EXECUTION);
      },
    },
    dispose: () => {
      disposed = true;
      endActive();
    },
  };
}
```

Run → all machine tests PASS.

- [ ] **Step 9: Composition — the lifetime signal, the hoisted `powerSaver`, the machines overlay**

In `src/composition.ts`:

- `nativePresenters(ports: AppPorts, lifetime: AbortSignal): Partial<Presenters>`: hoist `const powerSaver = createPowerSaverPresenter(preferences);` above the returned literal (comment: "Hoisted: `priceStream` and `priceHistory` gate their conflation on it — the RxJS core's order"), reference it as `powerSaver,` in the literal, and add:

```ts
    priceStream: createPriceStreamPresenter(ports.pricing, powerSaver.isCalm$),
    priceHistory: createPriceHistoryPresenter(ports.pricing, powerSaver.isCalm$),
    currencyPairs: createCurrencyPairsPresenter(ports.referenceData, lifetime),
    blotter: createBlotterPresenter(ports.blotter, lifetime),
    analytics: createAnalyticsPresenter(ports.analytics, lifetime),
    execution: createTradeExecutionPresenter(ports.execution),
```

- `composeWithBase`: mint `const lifetime = new AbortController();` before `nativePresenters(ports, lifetime.signal)`; `dispose` becomes:

```ts
    // The retained singletons hold port subscriptions for the app's life:
    // abort them FIRST — their relays may still be draining streams the
    // base app owns — then dispose the base. Idempotent: a second abort is
    // a no-op, and the base's dispose is its own concern.
    dispose: async () => {
      lifetime.abort();
      await base.dispose();
    },
```

Replace the slice-0 comment about "a member that spawns an app-lifetime loop" with that.

- `nativeMachines(presenters: Presenters): Partial<MachineFactories>`:

```ts
/** Native machine factories, closing over the SAME merged `presenters` the
 * RxJS builder gets — `staleFlag` reads `priceStream.price$(pair)` and
 * `analyticsStaleFlag` reads `analytics.position$`, both native above;
 * `tileExecution` reaches `execution.execute`. */
function nativeMachines(presenters: Presenters): Partial<MachineFactories> {
  return {
    tileExecution: (pair: CurrencyPair) => {
      return createTileExecutionMachine(pair, {
        execute: (input: ExecuteTradeInput) => {
          return presenters.execution.execute(input);
        },
      });
    },
    staleFlag: (pair: CurrencyPair) => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.priceStream.price$(pair),
      });
    },
    analyticsStaleFlag: () => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.analytics.position$,
      });
    },
    rowHighlight: (isNew: boolean) => {
      return createRowHighlightMachine(isNew);
    },
    notional: (defaultNotional: number) => {
      return createNotionalMachine(defaultNotional);
    },
  };
}

export function composeMachinesWithBase(presenters: Presenters): ComposedMachines {
  const base = createRxjsMachineFactories(presenters);
  return { base, machines: { ...base, ...nativeMachines(presenters) } };
}
```

Update the `nativePresenters` doc comment ("slice 2: the six FX pricing/blotter presenters; the four warm singletons are retained until `lifetime`").

`src/composition.machineFactories.test.ts` (the RxJS precedent, `packages/client-core/src/composition.machineFactories.test.ts` — read it and mirror its narrow-stub shape): "staleFlag watches the PRICE stream for its pair", "analyticsStaleFlag watches ANALYTICS, not the price stream", "tileExecution reaches execution.execute lazily", "rowHighlight and notional are native (not the base's)".

`src/composition.dispose.test.ts`: build `composeWithBase` over `createSimulatorPorts` + a `Subject`-backed `blotter`/`referenceData`/`analytics` (or the harness's `scriptPorts` — it is a devDependency, and this is a test), subscribe `blotter.trades$` once and unsubscribe, assert the port is still observed, `await app.dispose()`, assert released. Also: "dispose() twice is safe".

- [ ] **Step 10: `parity.json`, `index.ts`, README**

`src/parity.json`: flip `priceStream`, `priceHistory`, `execution`, `blotter`, `analytics`, `currencyPairs` under `presenters` and `tileExecution`, `staleFlag`, `analyticsStaleFlag`, `rowHighlight`, `notional` under `machines` to `"native"`.

`src/index.ts`: export the six presenter factories, the four machine factories (+ `StaleFlagDeps`, `TileExecutionDeps` types), `createConflatedTopic`, `relayTopic`, `promiseToStream`, `topicToStreamWithLead`; `once` is already exported — check.

`README.md`: in "Kernel", add rows `retainUntil` → `shareReplay({ refCount: false })` (`warmReplay`) and `relayTopic` → "a producer consuming another topic (`map`/`scan`)"; in "Bridge", add `once(source, signal)`, `promiseToStream`, `topicToStreamWithLead`; a new "Conflation and machines" section (5–8 lines): `createConflatedTopic` = `conflateWhen`; a machine = `Store` + `AbortController`; a machine's source failure is rethrown on a macrotask; in "Parity", 28/71 and the eleven names.

- [ ] **Step 11: The package gate**

```bash
pnpm --filter @rtc/client-core-async build
pnpm --filter @rtc/client-core-async typecheck
pnpm --filter @rtc/client-core-async test
pnpm --filter @rtc/client-core-async test:coverage
pnpm exec biome ci packages/client-core-async
pnpm exec eslint packages/client-core-async/src
pnpm exec depcruise --config .dependency-cruiser.cjs packages/client-core-async/src
```

Expected: the contract runner green on every slice-2 suite with the members now native (`parity.test.ts` proves the eleven are not the RxJS instances); coverage ≥95/95/95/85; lint and cruiser clean. `pnpm core:parity` → `native: async 28/71` (the effect column is Task 5's).

- [ ] **Step 12: Commit (by pathspec)**

```bash
git add packages/client-core-async
git commit -- packages/client-core-async -m "feat(client-core-async): slice 2 — FX pricing, blotter, execution and five machines native; retained topics, conflation, RPC bridge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

---

### Task 5: Effect core — Tag/Layer composition and the eleven native members

**Files:**
- Modify: `packages/client-core-effect/src/bridge/out.ts` (`EffectRunner`, `runnerFor`, `createDetachedHost`, `setRefIfChanged`, `fromPortIn`, `reportOutOfBand`, `SharedFold.retain`)
- Create: `packages/client-core-effect/src/bridge/rpc.ts` (moved from `in.ts`; `in.test.ts`'s rpc cases move to `rpc.test.ts`)
- Create: `packages/client-core-effect/src/services.ts`, `src/layers.ts`
- Modify: `packages/client-core-effect/src/presenters/mirrorPort.ts` (`MirrorOptions`)
- Create: `packages/client-core-effect/src/presenters/conflatedFold.ts`, `priceStream.ts`, `priceHistory.ts`, `warmSingletons.ts`, `blotter.ts`, `execution.ts`
- Create: `packages/client-core-effect/src/machines/notional.ts`, `rowHighlight.ts`, `staleFlag.ts`, `tileExecution.ts`
- Modify: `packages/client-core-effect/src/composition.ts`, `src/parity.json`, `src/index.ts`, `README.md`
- Modify: `.dependency-cruiser.cjs` — ONLY if the `effect-port-subscription-owned-by-the-bridge` rule's comment names `peek.ts` as the sole sibling; append "and `rpc` in `bridge/rpc.ts`" to that comment. The rule's `to` path stays `bridge/in\.ts$`.
- Test: `src/bridge/out.test.ts` (+4), `src/bridge/rpc.test.ts` (moved), `src/services.test.ts`, `src/layers.test.ts`, `src/presenters/{conflatedFold,priceStream,priceHistory,warmSingletons,blotter,execution}.test.ts`, `src/machines/{notional,rowHighlight,staleFlag,tileExecution}.test.ts`, `src/composition.machineFactories.test.ts`, `src/composition.dispose.test.ts` (extend if it exists, else new)

**Interfaces:**
- Consumes: the same `@rtc/client-core` folds and `@rtc/domain` constants/use cases as Task 4 (see Task 4's Interfaces block). The eleven suites through the runner.
- Produces: `interface EffectRunner { runSync<A, E>(effect: Effect.Effect<A, E>): A; runFork<A, E>(effect: Effect.Effect<A, E>, options?: Runtime.RunForkOptions): Fiber.RuntimeFiber<A, E>; }`; `EffectHost.runtime: EffectRunner` (was `ManagedRuntime`); `runnerFor(runtime: Runtime.Runtime<never>): EffectRunner`; `createDetachedHost(): EffectHost`; `setRefIfChanged<S>(ref: SubscriptionRef.SubscriptionRef<S>, next: (current: S) => S): Effect.Effect<void>`; `fromPortIn(scope: Scope.Scope): FromPort`; `reportOutOfBand(cause: Cause.Cause<unknown>): void`; `SharedFold<S>.retain?: boolean`; `rpc` from `#/bridge/rpc`; `AppPortsTag`, `HostTag`, `HostLive`, `presenterLayer`; the 22 `*Tag`/`*Live` pairs, `buildAppLayer(ports: AppPorts): Layer.Layer<NativeServices>`, `nativePresentersEffect: Effect.Effect<Partial<Presenters>, never, NativeServices>`; `conflatedFold(host, source, calm$, ms, seed): CoreStream<T>`; the six presenter factories `(host, port…)` and four machine factories with the same names and shapes as Task 4's (`createPriceStreamPresenter(host, pricing, isCalm$)`, `createCurrencyPairsPresenter(host, referenceData)` — no `lifetime`: the host scope is the lifetime, `createBlotterPresenter(host, blotter, now?)`, `createTradeExecutionPresenter(host, execution)`, `createNotionalMachine(defaultNotional)`, `createRowHighlightMachine(isNew)`, `createStaleFlagMachine(deps)`, `createTileExecutionMachine(pair, deps)`).

Tests use the package's `useHost()`/`tick()` idiom; timer cases use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync` (Effect's live `Clock` sleeps on the global `setTimeout`, which vitest fakes; its scheduler yields on `Promise.resolve` and, rarely, `setTimeout(…, 0)` — both advance under `advanceTimersByTimeAsync`). **First thing, before any port:** write `src/bridge/clock.test.ts` with one case — `vi.useFakeTimers()`, `Effect.runFork(Effect.sleep("100 millis").pipe(Effect.andThen(Effect.sync(() => { fired = true; }))))`, `await vi.advanceTimersByTimeAsync(99)` → `false`, `await vi.advanceTimersByTimeAsync(1)` → `true`. If that is red, STOP and report `BLOCKED` with the measurement: the contract's fake-clock suites cannot pass on this core without a clock injection, which is a plan defect to rule on, not something to work around.

Build only this package (`pnpm --filter @rtc/client-core-effect build`) — never a repo-wide build while Task 4 runs beside you.

- [ ] **Step 1: Bridge additions — failing tests**

Append to `src/bridge/out.test.ts`:

```ts
  it("sharedFold({ retain: true }) keeps the period across zero subscribers and ends it with the host scope", async () => {
    const host = useHost();
    const subject = new BehaviorSubject<number>(1);
    const stream = sharedFold(host, {
      retain: true,
      seed: () => {
        return Option.none();
      },
      run: (update: FoldUpdate<number>, fromPort: FromPort) => {
        return fromPort(subject).pipe(
          Stream.runForEach((v: number) => {
            return update(() => {
              return v;
            });
          }),
        );
      },
    });
    stream.subscribe(() => {}).unsubscribe();
    await tick();
    expect(subject.observed).toBe(true);
    const seen: number[] = [];
    stream.subscribe((v: number) => {
      seen.push(v);
    });
    expect(seen).toEqual([1]);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(subject.observed).toBe(false);
  });

  it("setRefIfChanged publishes a changed value and skips an Object.is-equal one", async () => {
    const host = useHost();
    const ref = host.runtime.runSync(SubscriptionRef.make(1));
    const seen: number[] = [];
    const sub = refToStateStream(host, ref).subscribe((v: number) => {
      seen.push(v);
    });
    await tick();
    host.runtime.runSync(setRefIfChanged(ref, () => {
      return 1;
    }));
    host.runtime.runSync(setRefIfChanged(ref, () => {
      return 2;
    }));
    await tick();
    await tick();
    expect(seen).toEqual([1, 2]);
    sub.unsubscribe();
  });

  it("fromPortIn(scope) subscribes at once and the scope's close releases it", async () => {
    const subject = new Subject<number>();
    const scope = Effect.runSync(Scope.make());
    fromPortIn(scope)(subject);
    expect(subject.observed).toBe(true);
    await Effect.runPromise(Scope.close(scope, Exit.void));
    expect(subject.observed).toBe(false);
  });

  it("createDetachedHost() runs effects on the default runtime under a scope of its own", async () => {
    const host = createDetachedHost();
    expect(host.runtime.runSync(Effect.succeed(3))).toBe(3);
    let interrupted = false;
    host.runtime.runFork(
      Effect.never.pipe(Effect.onInterrupt(() => {
        return Effect.sync(() => {
          interrupted = true;
        });
      })),
      { scope: host.scope },
    );
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(interrupted).toBe(true);
  });

  it("reportOutOfBand rethrows a squashed cause on a macrotask", () => {
    vi.useFakeTimers();
    reportOutOfBand(Cause.fail(new Error("machine")));
    expect(() => {
      vi.runAllTimers();
    }).toThrow("machine");
    vi.useRealTimers();
  });
```

Move `in.test.ts`'s `rpc` cases to `src/bridge/rpc.test.ts` importing from `#/bridge/rpc` (they stay verbatim otherwise).

Run → FAIL.

- [ ] **Step 2: Bridge additions**

`src/bridge/rpc.ts`: move the `rpc` function and its doc comment out of `in.ts` verbatim, with its imports (`Effect` from effect; `Observable`, `Subscription` types from rxjs). Replace the doc's second paragraph ("Kept as a bridge primitive … its own tests are its only caller today") with: "The RPC primitive for the one-shot ports (`execution.executeTrade`): lazy — nothing is subscribed until the Effect runs — which is why it lives here and not in `in.ts`, whose `fromObservable` subscribes eagerly and is confined to `sharedFold`'s `fromPort` (dependency-cruiser `effect-port-subscription-owned-by-the-bridge`)."

`src/bridge/out.ts` — five additions and one change:

```ts
/** What a host runs Effects with: the two operations every bridge helper
 * needs. A `ManagedRuntime` satisfies it structurally (the tests' `useHost`
 * keeps building one); `runnerFor` adapts a plain `Runtime` — what a Layer
 * captures with `Effect.runtime`, and what a detached machine host takes
 * from `Runtime.defaultRuntime`. */
export interface EffectRunner {
  runSync<A, E>(effect: Effect.Effect<A, E>): A;
  runFork<A, E>(
    effect: Effect.Effect<A, E>,
    options?: Runtime.RunForkOptions,
  ): Fiber.RuntimeFiber<A, E>;
}

export interface EffectHost {
  readonly runtime: EffectRunner;
  readonly scope: Scope.CloseableScope;
}

export function runnerFor(runtime: Runtime.Runtime<never>): EffectRunner {
  return {
    runSync: Runtime.runSync(runtime),
    runFork: Runtime.runFork(runtime),
  };
}

/** A host for something that owns its own lifetime rather than the app's —
 * a machine: `createMachineFactories(presenters)` has no app handle, so each
 * machine forks under the default runtime into a scope of its own and
 * `dispose()` closes it (slice 2 ruling 8). */
export function createDetachedHost(): EffectHost {
  return {
    runtime: runnerFor(Runtime.defaultRuntime),
    scope: Effect.runSync(Scope.make()),
  };
}

/** `SubscriptionRef.set` that publishes only a changed value: a
 * `SubscriptionRef` re-publishes an equal `set` (measured on 3.22.2), and a
 * machine's `state$` promises `distinctUntilChanged`. The same guard
 * `sharedFold`'s `update` applies, for a ref a machine owns directly. */
export function setRefIfChanged<S>(
  ref: SubscriptionRef.SubscriptionRef<S>,
  next: (current: S) => S,
): Effect.Effect<void> {
  return SubscriptionRef.get(ref).pipe(
    Effect.flatMap((current) => {
      const value = next(current);
      return Object.is(value, current) ? Effect.void : SubscriptionRef.set(ref, value);
    }),
  );
}

/** A `FromPort` bound to a scope that is not a fold period's — a machine's
 * own. Same rule as the period-scoped one: call it once per port per scope;
 * the subscription exists from the moment it returns and the scope's close
 * releases it. */
export function fromPortIn(scope: Scope.Scope): FromPort {
  return <T>(source: CoreStream<T>) => {
    return fromObservable(source, scope);
  };
}

/** Rethrow a cause on a macrotask, outside every fiber — the Effect twin of
 * the async core's `reportAsync`, for a machine whose source failed and
 * whose `SubscriptionRef` has no error channel (slice 2 ruling 8). */
export function reportOutOfBand(cause: Cause.Cause<unknown>): void {
  setTimeout(() => {
    throw Cause.squash(cause);
  }, 0);
}
```

`SharedFold<S>` gains:

```ts
  /** Keep the warm period across zero subscribers; only the host scope
   * ends it — the RxJS core's `warmReplay()` for a session singleton. */
  readonly retain?: boolean;
```

and the unsubscribe closure at the bottom of `sharedFold` becomes `if (period.subscribers.size === 0 && fold.retain !== true) { endPeriod(period); }`. Add `Runtime` and `Fiber` to the `effect` import. Every existing `useHost()` (a `ManagedRuntime` + a `Scope`) still typechecks against `EffectRunner`.

Run Step 1's tests → PASS; every existing test → PASS.

- [ ] **Step 3: Services and layers — failing tests**

`src/services.test.ts`:

```ts
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { HostLive, HostTag } from "#/services";

describe("HostLive", () => {
  it("builds synchronously, runs effects, and its scope closes with the runtime", async () => {
    const runtime = ManagedRuntime.make(HostLive);
    const host = runtime.runSync(HostTag);
    expect(host.runtime.runSync(Effect.succeed(1))).toBe(1);
    let interrupted = false;
    host.runtime.runFork(
      Effect.never.pipe(Effect.onInterrupt(() => {
        return Effect.sync(() => {
          interrupted = true;
        });
      })),
      { scope: host.scope },
    );
    await runtime.dispose();
    expect(interrupted).toBe(true);
  });

  it("closing the host scope directly is idempotent with the runtime's own dispose", async () => {
    const runtime = ManagedRuntime.make(HostLive);
    const host = runtime.runSync(HostTag);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await runtime.dispose();
    expect(Layer.isLayer(HostLive)).toBe(true);
  });
});
```

`src/layers.test.ts`:

```ts
import { Effect, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";

import { createSimulatorPorts, InMemorySessionStore } from "@rtc/client-core";
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";

import { buildAppLayer, nativePresentersEffect, PowerSaverTag, PriceStreamTag } from "#/layers";
import { HostTag } from "#/services";

describe("buildAppLayer", () => {
  it("resolves every native presenter in ONE synchronous runSync, and priceStream gates on the SAME powerSaver instance the record exposes", () => {
    const ports = createSimulatorPorts({
      preferences: new PreferencesSimulator({}),
      auth: new AuthSimulator({ demo: "pw" }),
      sessionStore: new InMemorySessionStore(),
    });
    const runtime = ManagedRuntime.make(buildAppLayer(ports));
    const { presenters, powerSaver, host } = runtime.runSync(
      Effect.all({ presenters: nativePresentersEffect, powerSaver: PowerSaverTag, host: HostTag }),
    );
    expect(presenters.powerSaver).toBe(powerSaver);
    expect(presenters.priceStream).toBe(runtime.runSync(PriceStreamTag));
    expect(Object.keys(presenters)).toHaveLength(22);
    expect(host.scope).toBeDefined();
    return runtime.dispose();
  });
});
```

Run → FAIL (modules missing).

- [ ] **Step 4: `services.ts` and `layers.ts`**

`src/services.ts`:

```ts
import { Context, Effect, ExecutionStrategy, Layer, Scope } from "effect";

import type { AppPorts } from "@rtc/core-api";

import { type EffectHost, runnerFor } from "#/bridge/out";

/** The ports the app was created with, as a service: `createApp(ports)`
 * provides them with `Layer.succeed(AppPortsTag, ports)`. `GenericTag`
 * rather than `class … extends Context.Tag(…)`: a class must name its file
 * (`rtc/class-filename-match`), and twenty-two files for twenty-two tags
 * would be the wrong trade. */
export const AppPortsTag = Context.GenericTag<AppPorts>(
  "@rtc/client-core-effect/AppPorts",
);

/** The Effect side every native presenter runs under — the `EffectHost`
 * `sharedFold` and `streamToStream` take — as a service. */
export const HostTag = Context.GenericTag<EffectHost>(
  "@rtc/client-core-effect/Host",
);

/** The host as a scoped Layer: the runtime is the one the Layer is built
 * under (`Effect.runtime`), and the scope is a closeable CHILD of the Layer's
 * own scope — closeable so `app.dispose()` can end it explicitly (the
 * order §22 documents: base app, then the scope, then the runtime), a child
 * so `runtime.dispose()` ends it anyway if nobody did. Every fold period is
 * forked from it. */
export const HostLive: Layer.Layer<EffectHost> = Layer.scoped(
  HostTag,
  Effect.gen(function* () {
    const runtime = yield* Effect.runtime<never>();
    const parent = yield* Effect.scope;
    const scope = yield* Scope.fork(parent, ExecutionStrategy.sequential);
    return { runtime: runnerFor(runtime), scope };
  }),
);

/** A presenter that needs only the host and the ports, as a Layer. */
export function presenterLayer<S>(
  tag: Context.Tag<S, S>,
  build: (host: EffectHost, ports: AppPorts) => S,
): Layer.Layer<S, never, EffectHost | AppPorts> {
  return Layer.effect(
    tag,
    Effect.map(Effect.all([HostTag, AppPortsTag]), ([host, ports]) => {
      return build(host, ports);
    }),
  );
}
```

(`Context.GenericTag<S>(key)` is `Tag<S, S>`: the identifier IS the service type, so a Layer's `RIn`/`ROut` are spelled as the presenter interfaces themselves — `Layer.Layer<EffectHost>`, `EffectHost | AppPorts`. That is what the explicit return types below use.)

`src/layers.ts`:

```ts
import { Context, Effect, Layer } from "effect";

import type {
  AmbientStylePresenter,
  AnalyticsPresenter,
  AnimatedBackgroundPresenter,
  AppPorts,
  BlotterPresenter,
  BootPreferencePresenter,
  ChartSubstratePresenter,
  ConnectionStatusPresenter,
  CreditRfqFilterPreferencePresenter,
  CurrencyPairsPresenter,
  EqBlotterViewPreferencePresenter,
  EqWatchlistSortPreferencePresenter,
  ForceBootAnimationPresenter,
  JarvisPreferencesPresenter,
  LayoutEnginePresenter,
  LoginWaitPreferencesPresenter,
  PowerSaverPresenter,
  Presenters,
  PriceHistoryPresenter,
  PriceStreamPresenter,
  ThemePreferencePresenter,
  ThemeSkinPreferencePresenter,
  TradeExecutionPresenter,
  ViewModePreferencePresenter,
} from "@rtc/core-api";

import type { EffectHost } from "#/bridge/out";
import { createBlotterPresenter } from "#/presenters/blotter";
import { createConnectionPresenter } from "#/presenters/connection";
import { createTradeExecutionPresenter } from "#/presenters/execution";
import {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
import {
  createAmbientStylePresenter,
  createAnimatedBackgroundPresenter,
  createChartSubstratePresenter,
  createCreditRfqFilterPreferencePresenter,
  createEqBlotterViewPreferencePresenter,
  createForceBootAnimationPresenter,
  createLayoutEnginePresenter,
  createPowerSaverPresenter,
  createThemeSkinPreferencePresenter,
  createViewModePreferencePresenter,
} from "#/presenters/preferences";
import { createPriceHistoryPresenter } from "#/presenters/priceHistory";
import { createPriceStreamPresenter } from "#/presenters/priceStream";
import {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";
import { createThemePreferencePresenter } from "#/presenters/themePreference";
import {
  createAnalyticsPresenter,
  createCurrencyPairsPresenter,
} from "#/presenters/warmSingletons";
import { AppPortsTag, HostLive, HostTag, presenterLayer } from "#/services";

// One tag per native presenter. The key is the member's name in
// `Presenters`, so a tag reads as the member it resolves to.
export const ConnectionTag = Context.GenericTag<ConnectionStatusPresenter>("@rtc/client-core-effect/connection");
export const ThemePreferenceTag = Context.GenericTag<ThemePreferencePresenter>("@rtc/client-core-effect/themePreference");
export const ThemeSkinPreferenceTag = Context.GenericTag<ThemeSkinPreferencePresenter>("@rtc/client-core-effect/themeSkinPreference");
export const ViewModePreferenceTag = Context.GenericTag<ViewModePreferencePresenter>("@rtc/client-core-effect/viewModePreference");
export const PowerSaverTag = Context.GenericTag<PowerSaverPresenter>("@rtc/client-core-effect/powerSaver");
export const CreditRfqFilterPreferenceTag = Context.GenericTag<CreditRfqFilterPreferencePresenter>("@rtc/client-core-effect/creditRfqFilterPreference");
export const EqWatchlistSortPreferenceTag = Context.GenericTag<EqWatchlistSortPreferencePresenter>("@rtc/client-core-effect/eqWatchlistSortPreference");
export const EqBlotterViewPreferenceTag = Context.GenericTag<EqBlotterViewPreferencePresenter>("@rtc/client-core-effect/eqBlotterViewPreference");
export const BootPreferenceTag = Context.GenericTag<BootPreferencePresenter>("@rtc/client-core-effect/bootPreference");
export const LoginWaitPreferencesTag = Context.GenericTag<LoginWaitPreferencesPresenter>("@rtc/client-core-effect/loginWaitPreferences");
export const JarvisPreferencesTag = Context.GenericTag<JarvisPreferencesPresenter>("@rtc/client-core-effect/jarvisPreferences");
export const AnimatedBackgroundTag = Context.GenericTag<AnimatedBackgroundPresenter>("@rtc/client-core-effect/animatedBackground");
export const AmbientStyleTag = Context.GenericTag<AmbientStylePresenter>("@rtc/client-core-effect/ambientStyle");
export const ChartSubstrateTag = Context.GenericTag<ChartSubstratePresenter>("@rtc/client-core-effect/chartSubstrate");
export const LayoutEngineTag = Context.GenericTag<LayoutEnginePresenter>("@rtc/client-core-effect/layoutEngine");
export const ForceBootAnimationTag = Context.GenericTag<ForceBootAnimationPresenter>("@rtc/client-core-effect/forceBootAnimation");
export const PriceStreamTag = Context.GenericTag<PriceStreamPresenter>("@rtc/client-core-effect/priceStream");
export const PriceHistoryTag = Context.GenericTag<PriceHistoryPresenter>("@rtc/client-core-effect/priceHistory");
export const CurrencyPairsTag = Context.GenericTag<CurrencyPairsPresenter>("@rtc/client-core-effect/currencyPairs");
export const BlotterTag = Context.GenericTag<BlotterPresenter>("@rtc/client-core-effect/blotter");
export const AnalyticsTag = Context.GenericTag<AnalyticsPresenter>("@rtc/client-core-effect/analytics");
export const ExecutionTag = Context.GenericTag<TradeExecutionPresenter>("@rtc/client-core-effect/execution");

/** Every native service the app layer provides — the identifier of each
 * `GenericTag` is its service type. */
export type NativeServices =
  | ConnectionStatusPresenter
  | ThemePreferencePresenter
  | ThemeSkinPreferencePresenter
  | ViewModePreferencePresenter
  | PowerSaverPresenter
  | CreditRfqFilterPreferencePresenter
  | EqWatchlistSortPreferencePresenter
  | EqBlotterViewPreferencePresenter
  | BootPreferencePresenter
  | LoginWaitPreferencesPresenter
  | JarvisPreferencesPresenter
  | AnimatedBackgroundPresenter
  | AmbientStylePresenter
  | ChartSubstratePresenter
  | LayoutEnginePresenter
  | ForceBootAnimationPresenter
  | PriceStreamPresenter
  | PriceHistoryPresenter
  | CurrencyPairsPresenter
  | BlotterPresenter
  | AnalyticsPresenter
  | TradeExecutionPresenter;

// Presenters that need only the host and the ports.
export const ConnectionLive = presenterLayer(ConnectionTag, (host, ports) => {
  return createConnectionPresenter(host, ports.connectionEvents);
});
export const ThemePreferenceLive = presenterLayer(ThemePreferenceTag, (host, ports) => {
  return createThemePreferencePresenter(host, ports.preferences, ports.colorScheme);
});
export const ThemeSkinPreferenceLive = presenterLayer(ThemeSkinPreferenceTag, (host, ports) => {
  return createThemeSkinPreferencePresenter(host, ports.preferences);
});
export const ViewModePreferenceLive = presenterLayer(ViewModePreferenceTag, (host, ports) => {
  return createViewModePreferencePresenter(host, ports.preferences);
});
export const PowerSaverLive = presenterLayer(PowerSaverTag, (host, ports) => {
  return createPowerSaverPresenter(host, ports.preferences);
});
export const CreditRfqFilterPreferenceLive = presenterLayer(CreditRfqFilterPreferenceTag, (host, ports) => {
  return createCreditRfqFilterPreferencePresenter(host, ports.preferences);
});
export const EqWatchlistSortPreferenceLive = presenterLayer(EqWatchlistSortPreferenceTag, (host, ports) => {
  return createEqWatchlistSortPreferencePresenter(host, ports.preferences);
});
export const EqBlotterViewPreferenceLive = presenterLayer(EqBlotterViewPreferenceTag, (host, ports) => {
  return createEqBlotterViewPreferencePresenter(host, ports.preferences);
});
export const BootPreferenceLive = presenterLayer(BootPreferenceTag, (_host, ports) => {
  return createBootPreferencePresenter(ports.preferences);
});
export const LoginWaitPreferencesLive = presenterLayer(LoginWaitPreferencesTag, (host, ports) => {
  return createLoginWaitPreferencesPresenter(host, ports.preferences);
});
export const JarvisPreferencesLive = presenterLayer(JarvisPreferencesTag, (host, ports) => {
  return createJarvisPreferencesPresenter(host, ports.preferences);
});
export const AnimatedBackgroundLive = presenterLayer(AnimatedBackgroundTag, (host, ports) => {
  return createAnimatedBackgroundPresenter(host, ports.preferences);
});
export const AmbientStyleLive = presenterLayer(AmbientStyleTag, (host, ports) => {
  return createAmbientStylePresenter(host, ports.preferences);
});
export const ChartSubstrateLive = presenterLayer(ChartSubstrateTag, (host, ports) => {
  return createChartSubstratePresenter(host, ports.preferences);
});
export const LayoutEngineLive = presenterLayer(LayoutEngineTag, (host, ports) => {
  return createLayoutEnginePresenter(host, ports.preferences);
});
export const ForceBootAnimationLive = presenterLayer(ForceBootAnimationTag, (host, ports) => {
  return createForceBootAnimationPresenter(host, ports.preferences);
});
export const CurrencyPairsLive = presenterLayer(CurrencyPairsTag, (host, ports) => {
  return createCurrencyPairsPresenter(host, ports.referenceData);
});
export const BlotterLive = presenterLayer(BlotterTag, (host, ports) => {
  return createBlotterPresenter(host, ports.blotter);
});
export const AnalyticsLive = presenterLayer(AnalyticsTag, (host, ports) => {
  return createAnalyticsPresenter(host, ports.analytics);
});
export const ExecutionLive = presenterLayer(ExecutionTag, (host, ports) => {
  return createTradeExecutionPresenter(host, ports.execution);
});

// The two presenters that depend on ANOTHER native presenter — the reason
// this slice introduces the Layer graph: `priceStream` and `priceHistory`
// gate their conflation on `powerSaver.isCalm$`.
export const PriceStreamLive: Layer.Layer<PriceStreamPresenter, never, EffectHost | AppPorts | PowerSaverPresenter> =
  Layer.effect(
    PriceStreamTag,
    Effect.gen(function* () {
      const host = yield* HostTag;
      const ports = yield* AppPortsTag;
      const powerSaver = yield* PowerSaverTag;
      return createPriceStreamPresenter(host, ports.pricing, powerSaver.isCalm$);
    }),
  );
export const PriceHistoryLive: Layer.Layer<PriceHistoryPresenter, never, EffectHost | AppPorts | PowerSaverPresenter> =
  Layer.effect(
    PriceHistoryTag,
    Effect.gen(function* () {
      const host = yield* HostTag;
      const ports = yield* AppPortsTag;
      const powerSaver = yield* PowerSaverTag;
      return createPriceHistoryPresenter(host, ports.pricing, powerSaver.isCalm$);
    }),
  );

/** The whole native app as one Layer over the ports. `PowerSaverLive` is
 * both merged into the app and provided to the two dependents: a Layer is
 * memoised by reference within one build, so it is constructed ONCE and
 * `presenters.powerSaver` IS the instance `priceStream` gates on
 * (`layers.test.ts` pins that). */
export function buildAppLayer(ports: AppPorts): Layer.Layer<NativeServices> {
  const base = Layer.merge(HostLive, Layer.succeed(AppPortsTag, ports));
  const independent = Layer.mergeAll(
    ConnectionLive,
    ThemePreferenceLive,
    ThemeSkinPreferenceLive,
    ViewModePreferenceLive,
    PowerSaverLive,
    CreditRfqFilterPreferenceLive,
    EqWatchlistSortPreferenceLive,
    EqBlotterViewPreferenceLive,
    BootPreferenceLive,
    LoginWaitPreferencesLive,
    JarvisPreferencesLive,
    AnimatedBackgroundLive,
    AmbientStyleLive,
    ChartSubstrateLive,
    LayoutEngineLive,
    ForceBootAnimationLive,
    CurrencyPairsLive,
    BlotterLive,
    AnalyticsLive,
    ExecutionLive,
  );
  const dependent = Layer.mergeAll(PriceStreamLive, PriceHistoryLive).pipe(
    Layer.provide(PowerSaverLive),
  );
  return Layer.merge(independent, dependent).pipe(Layer.provide(base));
}

/** Resolve every tag into the `Presenters` overlay — the ONE `runSync`
 * `composeWithBase` makes. */
export const nativePresentersEffect: Effect.Effect<Partial<Presenters>, never, NativeServices> =
  Effect.all({
    connection: ConnectionTag,
    themePreference: ThemePreferenceTag,
    themeSkinPreference: ThemeSkinPreferenceTag,
    viewModePreference: ViewModePreferenceTag,
    powerSaver: PowerSaverTag,
    creditRfqFilterPreference: CreditRfqFilterPreferenceTag,
    eqWatchlistSortPreference: EqWatchlistSortPreferenceTag,
    eqBlotterViewPreference: EqBlotterViewPreferenceTag,
    bootPreference: BootPreferenceTag,
    loginWaitPreferences: LoginWaitPreferencesTag,
    jarvisPreferences: JarvisPreferencesTag,
    animatedBackground: AnimatedBackgroundTag,
    ambientStyle: AmbientStyleTag,
    chartSubstrate: ChartSubstrateTag,
    layoutEngine: LayoutEngineTag,
    forceBootAnimation: ForceBootAnimationTag,
    priceStream: PriceStreamTag,
    priceHistory: PriceHistoryTag,
    currencyPairs: CurrencyPairsTag,
    blotter: BlotterTag,
    analytics: AnalyticsTag,
    execution: ExecutionTag,
  });
```

Type notes for the implementer: `Layer.mergeAll` accepts up to its overload limit of arguments (≥ 20 on 3.22); if the twenty-argument call trips it, split `independent` into two `mergeAll`s and `Layer.merge` them. `Layer.merge(independent, dependent)`'s `RIn` is `EffectHost | AppPorts` after `dependent` had `PowerSaverLive` provided (whose own `RIn` is `EffectHost | AppPorts`), and `Layer.provide(base)` discharges it — the declared return type `Layer.Layer<NativeServices>` (no `E`, no `RIn`) is what pins that. Biome will wrap the one-line tag declarations; let it.

Run Step 3's tests → PASS (the six slice-2 presenters do not exist yet — create their files in Step 7 first if you prefer green in one go; otherwise stub `layers.ts` with the 16 existing presenters and add the six in Step 7).

- [ ] **Step 5: `mirrorPort` options and `conflatedFold` — failing tests**

Append to `src/presenters/preferences.test.ts` or a new `src/presenters/mirrorPort.test.ts`: "mirrorPortAsIs(host, source, { retain: true }) keeps the port subscribed across zero subscribers" (a `BehaviorSubject`, subscribe/unsubscribe, `await tick()`, `observed` true; close the host scope, `observed` false).

`src/presenters/conflatedFold.test.ts` — the same five cases as the async `conflatedTopic.test.ts` (Task 4 Step 5), each built as `conflatedFold(useHost(), source, calm, 100, () => Option.none())` with `await vi.advanceTimersByTimeAsync(0)` twice after each synchronous burst before asserting (the fold delivers on a fiber); the fake timers installed in `beforeEach` BEFORE `useHost()`. Plus one seed case: "a Some seed is delivered synchronously on subscribe".

Run → FAIL.

- [ ] **Step 6: `MirrorOptions` and `conflatedFold`**

`src/presenters/mirrorPort.ts`: add

```ts
export interface MirrorOptions {
  /** Keep the period across zero subscribers (`SharedFold.retain`). */
  readonly retain?: boolean;
}
```

`mirrorPort(host, source, project, options: MirrorOptions = {})` passes `retain: options.retain` into the `sharedFold` object; `mirrorPortAsIs(host, source, options?)` forwards it. Every existing call site is unchanged (the parameter is optional).

`src/presenters/conflatedFold.ts`:

```ts
import { Duration, Effect, Fiber, Option, Ref, Stream } from "effect";

import type { Stream as CoreStream } from "@rtc/core-api";

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  sharedFold,
} from "#/bridge/out";

/** One input of the conflation fold. */
type ConflationEvent<T> =
  | { readonly kind: "tick"; readonly value: T }
  | { readonly kind: "calm"; readonly on: boolean };

/** The fold's state, held in ONE `Ref` so every transition is an atomic
 * `Ref.modify` — the window timer fires on its own fiber, and a `get`
 * followed by a `set` would let it interleave between them. */
interface ConflationState<T> {
  readonly calm: Option.Option<boolean>;
  readonly window: Option.Option<Fiber.RuntimeFiber<void>>;
  readonly pending: Option.Option<T>;
}

/** What a transition asks the runner to do, after the state has moved. */
type ConflationAction<T> =
  | { readonly kind: "none" }
  | { readonly kind: "emit"; readonly value: T }
  | { readonly kind: "emitAndOpen"; readonly value: T }
  | { readonly kind: "interrupt"; readonly fiber: Fiber.RuntimeFiber<void> };

/** The RxJS core's `conflateWhen(flag$, ms)` restated inside a `sharedFold`'s
 * `run`: a leading+trailing throttle gated by the calm flag. While calm, a
 * value with no window open is emitted at once and opens a window of `ms`
 * (a forked `Effect.sleep`); values inside the window replace the pending
 * slot; at the window's end the pending value (if any) is emitted and a new
 * window opens. While not calm, every value passes. Calm → off interrupts
 * the window and drops its pending value; off → calm starts fresh. Values
 * before the flag has spoken are dropped. Hand-written because Effect has
 * no leading+trailing throttle (`Stream.throttle` is a token bucket,
 * `aggregateWithin` trailing-only) — slice 2 ruling 7. */
export function conflatedFold<T>(
  host: EffectHost,
  source: CoreStream<T>,
  calm$: CoreStream<boolean>,
  ms: number,
  seed: () => Option.Option<T>,
): CoreStream<T> {
  return sharedFold(host, {
    seed,
    run: (update: FoldUpdate<T>, fromPort: FromPort) => {
      return Effect.gen(function* () {
        const state = yield* Ref.make<ConflationState<T>>({
          calm: Option.none(),
          window: Option.none(),
          pending: Option.none(),
        });

        function emit(value: T): Effect.Effect<void> {
          return update(() => {
            return value;
          });
        }

        // ONE fiber per window, forked from the producer (so the period's end
        // interrupts it) and looping in place: at each window's end it
        // publishes the pending value and sleeps again, or closes when nothing
        // is pending. It must NOT fork the next window itself — a forked child
        // is interrupted when its parent fiber completes, so a timer fiber that
        // forked its successor and then ended would kill it at once.
        function windowLoop(): Effect.Effect<void> {
          return Effect.gen(function* () {
            let open = true;

            while (open) {
              yield* Effect.sleep(Duration.millis(ms));
              const trailing = yield* Ref.modify(
                state,
                (current): [Option.Option<T>, ConflationState<T>] => {
                  return Option.isSome(current.pending)
                    ? [current.pending, { ...current, pending: Option.none() }]
                    : [
                        Option.none(),
                        { ...current, window: Option.none(), pending: Option.none() },
                      ];
                },
              );

              if (Option.isSome(trailing)) {
                yield* emit(trailing.value);
              } else {
                open = false;
              }
            }
          });
        }

        function openWindow(): Effect.Effect<void> {
          return Effect.fork(windowLoop()).pipe(
            Effect.flatMap((fiber) => {
              return Ref.update(state, (current) => {
                return { ...current, window: Option.some(fiber) };
              });
            }),
          );
        }

        function act(action: ConflationAction<T>): Effect.Effect<void> {
          switch (action.kind) {
            case "none":
              return Effect.void;
            case "emit":
              return emit(action.value);
            case "emitAndOpen":
              return emit(action.value).pipe(Effect.andThen(openWindow()));
            case "interrupt":
              return Fiber.interrupt(action.fiber).pipe(Effect.asVoid);
          }
        }

        function transition(
          current: ConflationState<T>,
          event: ConflationEvent<T>,
        ): [ConflationAction<T>, ConflationState<T>] {
          if (event.kind === "calm") {
            const next: ConflationState<T> = { ...current, calm: Option.some(event.on) };

            if (!event.on && Option.isSome(current.window)) {
              return [
                { kind: "interrupt", fiber: current.window.value },
                { ...next, window: Option.none(), pending: Option.none() },
              ];
            }

            return [{ kind: "none" }, next];
          }

          if (Option.isNone(current.calm)) {
            return [{ kind: "none" }, current];
          }

          if (!current.calm.value) {
            return [{ kind: "emit", value: event.value }, current];
          }

          if (Option.isNone(current.window)) {
            return [{ kind: "emitAndOpen", value: event.value }, current];
          }

          return [{ kind: "none" }, { ...current, pending: Option.some(event.value) }];
        }

        const events = Stream.merge(
          fromPort(source).pipe(
            Stream.map((value): ConflationEvent<T> => {
              return { kind: "tick", value };
            }),
          ),
          fromPort(calm$).pipe(
            Stream.map((on): ConflationEvent<T> => {
              return { kind: "calm", on };
            }),
          ),
        );

        yield* Stream.runForEach(events, (event) => {
          return Ref.modify(state, (current) => {
            return transition(current, event);
          }).pipe(Effect.flatMap(act));
        });
      });
    },
  });
}
```

Implementation notes: the window fiber is a child of the period's producer fiber, so the period's scope closing (last unsubscribe) interrupts it — nothing is published after teardown. `Ref.modify`'s callback returns `[A, S]`; the tuple type annotation on `windowLoop`'s callback keeps inference honest. The window-end `Ref.modify` leaves `window` set while it loops and clears it only when it closes, so a tick arriving during the trailing emission still lands in `pending`, never as a second leading value. The `switch` over `action.kind` needs no `default`: the union is exhaustive and `useExplicitType` is satisfied by the declared return. If `Effect.sleep(Duration.millis(ms))` reads better as `Effect.sleep(`${ms} millis`)`, either is fine.

Run Step 5's tests → PASS.

- [ ] **Step 7: The six presenters — tests, then files**

Tests (mirror Task 4 Step 6's cases, with `useHost()` and `tick()`s): `src/presenters/priceStream.test.ts` ("opens the port stream per warm period through the use case, never at construction, and memoises per pair"), `priceHistory.test.ts` ("a Some seed: the retained window is delivered synchronously on resubscribe"; "a never-mounted symbol seeds None"), `warmSingletons.test.ts` ("port called once at construction; retained across zero subscribers; released when the host scope closes"), `blotter.test.ts` ("activity$ is retained and stamps with the injected clock"; "newTradeIds$ restarts per period"), `execution.test.ts` ("execute() subscribes the port only when subscribed and interrupts on unsubscribe"; "executions$ reaches only fibers subscribed before the publish").

`src/presenters/priceStream.ts`:

```ts
import { Option } from "effect";

import type { PriceStreamPresenter, Stream } from "@rtc/core-api";
import {
  type CurrencyPair,
  type Price,
  PRICE_CONFLATION_MS,
  PriceStreamUseCase,
  type PricingPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { conflatedFold } from "#/presenters/conflatedFold";

/** Per-pair live prices, memoised per symbol. Each stream is a conflated
 * fold over the use case's `defer`red Observable: the port is subscribed
 * per warm period through `fromPort`, never here; every period starts
 * seedless (a price feed has no synchronous value) and silent until the
 * first tick. */
export function createPriceStreamPresenter(
  host: EffectHost,
  pricing: PricingPort,
  isCalm$: Stream<boolean>,
): PriceStreamPresenter {
  const useCase = new PriceStreamUseCase(pricing);
  const cache = new Map<string, Stream<Price>>();

  return {
    price$: (pair: CurrencyPair) => {
      const cached = cache.get(pair.symbol);

      if (cached !== undefined) {
        return cached;
      }

      const stream = conflatedFold(host, useCase.execute(pair), isCalm$, PRICE_CONFLATION_MS, () => {
        return Option.none();
      });
      cache.set(pair.symbol, stream);
      return stream;
    },
  };
}
```

`src/presenters/priceHistory.ts` — same shape with `PriceHistoryUseCase`, `PRICE_HISTORY_CONFLATION_MS`, a per-symbol `retained: PriceTick[]` handed to `useCase.execute(symbol, retained)`, and the seed `() => { return retained.length === 0 ? Option.none() : Option.some<readonly PriceTick[]>([...retained]); }` — the retained window IS the period's seed, delivered synchronously to the first subscriber of a remount (the RxJS `startWith`). Doc: the window array outlives every period; the port does not.

`src/presenters/warmSingletons.ts`:

```ts
import type { AnalyticsPresenter, CurrencyPairsPresenter } from "@rtc/core-api";
import {
  type AnalyticsPort,
  AnalyticsUseCase,
  CurrencyPairsUseCase,
  type ReferenceDataPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** The currency-pair roster: a RETAINED mirror — the period that the first
 * subscriber opens is never ended by an unsubscribe, only by the host scope
 * (`app.dispose()`): the RxJS core's `warmReplay()`. Port called ONCE. */
export function createCurrencyPairsPresenter(
  host: EffectHost,
  referenceData: ReferenceDataPort,
): CurrencyPairsPresenter {
  const source = new CurrencyPairsUseCase(referenceData).execute();

  return { pairs$: mirrorPortAsIs(host, source, { retain: true }) };
}

/** The analytics position stream — the same retained-mirror shape. */
export function createAnalyticsPresenter(
  host: EffectHost,
  analytics: AnalyticsPort,
): AnalyticsPresenter {
  const source = new AnalyticsUseCase(analytics).execute();

  return { position$: mirrorPortAsIs(host, source, { retain: true }) };
}
```

`src/presenters/blotter.ts`:

```ts
import { Option, Stream } from "effect";

import {
  createActivityScan,
  createNewTradeScan,
  reduceActivity,
  reduceNewTrades,
} from "@rtc/client-core";
import type { ActivityEntry, BlotterPresenter } from "@rtc/core-api";
import { type BlotterPort, TradeBlotterUseCase } from "@rtc/domain";

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  sharedFold,
} from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** `trades$` is the retained mirror of the port. `newTradeIds$` is a
 * refCounted fold over it whose scan state lives in the period's producer
 * (a fresh period restarts from "nothing seen", as the RxJS `scan` under a
 * refCounted `shareReplay` does); `activity$` is the same fold RETAINED
 * for the session. Both run the RxJS core's reducers, imported. `now` is
 * injectable so a test can pin the clock stamp. */
export function createBlotterPresenter(
  host: EffectHost,
  blotter: BlotterPort,
  now: () => number = Date.now,
): BlotterPresenter {
  // Called ONCE, here.
  const source = new TradeBlotterUseCase(blotter).execute();
  const trades$ = mirrorPortAsIs(host, source, { retain: true });

  return {
    trades$,
    newTradeIds$: sharedFold<ReadonlySet<number>>(host, {
      seed: () => {
        return Option.none();
      },
      run: (update: FoldUpdate<ReadonlySet<number>>, fromPort: FromPort) => {
        let scan = createNewTradeScan();
        return fromPort(trades$).pipe(
          Stream.runForEach((snapshot) => {
            scan = reduceNewTrades(scan, snapshot);
            const { fresh } = scan;
            return update(() => {
              return fresh;
            });
          }),
        );
      },
    }),
    activity$: sharedFold<readonly ActivityEntry[]>(host, {
      retain: true,
      seed: () => {
        return Option.none();
      },
      run: (update: FoldUpdate<readonly ActivityEntry[]>, fromPort: FromPort) => {
        let scan = createActivityScan();
        return fromPort(trades$).pipe(
          Stream.runForEach((snapshot) => {
            scan = reduceActivity(scan, snapshot, now());
            const { entries } = scan;
            return update(() => {
              return entries;
            });
          }),
        );
      },
    }),
  };
}
```

`src/presenters/execution.ts`:

```ts
import { Effect, PubSub, Stream } from "effect";

import type { ExecutionOutcome, TradeExecutionPresenter } from "@rtc/core-api";
import {
  type ExecuteTradeInput,
  ExecuteTradeUseCase,
  type ExecutionPort,
} from "@rtc/domain";

import { type EffectHost, streamToStream } from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

/** `executions$` is hot with no replay: a `PubSub` each subscriber drains on
 * its own fiber — a publish before that fiber has subscribed reaches nobody,
 * as it reaches nobody on an RxJS `Subject` with no observer (slice 2
 * ruling 12). `execute(input)` is a one-shot command: the port call is
 * suspended until the returned stream is subscribed, the outcome is
 * published, the result is emitted and the stream completes; unsubscribing
 * interrupts the fiber and with it the port subscription. */
export function createTradeExecutionPresenter(
  host: EffectHost,
  execution: ExecutionPort,
): TradeExecutionPresenter {
  const useCase = new ExecuteTradeUseCase(execution);
  const outcomes = host.runtime.runSync(PubSub.unbounded<ExecutionOutcome>());

  return {
    executions$: streamToStream(host, Stream.fromPubSub(outcomes)),
    execute: (input: ExecuteTradeInput) => {
      return streamToStream(
        host,
        Stream.fromEffect(
          Effect.suspend(() => {
            return rpc(useCase.execute(input));
          }).pipe(
            Effect.tap((result) => {
              return PubSub.publish(outcomes, {
                symbol: input.pair.symbol,
                status: result.status,
              });
            }),
          ),
        ),
      );
    },
  };
}
```

Add the six to `layers.ts` if you stubbed it in Step 4. Run Step 7's tests → PASS.

- [ ] **Step 8: The four machines — tests, then files**

Tests mirror Task 4 Step 8's cases, over `refToStateStream`-backed `state$`, with `tick()`s after intents (Effect delivers on a fiber) and fake timers for `rowHighlight`/`tileExecution`. `staleFlag.test.ts`'s failure case: `vi.useFakeTimers()`, error the value source, `await vi.advanceTimersByTimeAsync(0)` (let the fiber reach `reportOutOfBand`), then `expect(() => vi.runAllTimers()).toThrow("feed")`, and both sources released.

`src/machines/notional.ts`:

```ts
import { Effect, Exit, Scope, SubscriptionRef } from "effect";

import { createInitialNotionalView, reduceNotionalInput } from "@rtc/client-core";
import type { Machine, NotionalIntents, NotionalView } from "@rtc/core-api";

import { createDetachedHost, refToStateStream, setRefIfChanged } from "#/bridge/out";

/** A `SubscriptionRef` plus two intents; the view math is the RxJS core's,
 * imported. Each intent is one synchronous `setRefIfChanged`; `dispose()`
 * closes the machine's scope and makes the intents inert. */
export function createNotionalMachine(
  defaultNotional: number,
): Machine<NotionalView, NotionalIntents> {
  const host = createDetachedHost();
  const initial = createInitialNotionalView(defaultNotional);
  const ref = host.runtime.runSync(SubscriptionRef.make(initial));
  let disposed = false;

  function set(view: NotionalView): void {
    if (!disposed) {
      host.runtime.runSync(setRefIfChanged(ref, () => {
        return view;
      }));
    }
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {
      change: (input: string) => {
        set(reduceNotionalInput(defaultNotional, input));
      },
      reset: () => {
        set(initial);
      },
    },
    dispose: () => {
      disposed = true;
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
```

`src/machines/rowHighlight.ts`:

```ts
import { Duration, Effect, Exit, Scope, SubscriptionRef } from "effect";

import type { ReadOnlyMachine } from "@rtc/core-api";
import { BLOTTER_ROW_HIGHLIGHT_MS } from "@rtc/domain";

import { createDetachedHost, refToStateStream, setRefIfChanged } from "#/bridge/out";

/** `isNew` at once, then `false` after `BLOTTER_ROW_HIGHLIGHT_MS` on a fiber
 * forked into the machine's scope; `dispose()` closes the scope, which
 * interrupts the sleep. A row that is not new never changes. */
export function createRowHighlightMachine(isNew: boolean): ReadOnlyMachine<boolean> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(SubscriptionRef.make(isNew));

  if (isNew) {
    host.runtime.runFork(
      Effect.sleep(Duration.millis(BLOTTER_ROW_HIGHLIGHT_MS)).pipe(
        Effect.andThen(setRefIfChanged(ref, () => {
          return false;
        })),
      ),
      { scope: host.scope },
    );
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {},
    dispose: () => {
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
```

`src/machines/staleFlag.ts`:

```ts
import { Cause, Effect, Exit, Scope, Stream, SubscriptionRef } from "effect";

import {
  createStaleFlagAcc,
  reduceStaleFlag,
  type StaleFlagAcc,
  type StaleFlagEvent,
} from "@rtc/client-core";
import type { ReadOnlyMachine, Stream as CoreStream } from "@rtc/core-api";
import type { ConnectionStatus } from "@rtc/domain";

import {
  createDetachedHost,
  fromPortIn,
  refToStateStream,
  reportOutOfBand,
  setRefIfChanged,
} from "#/bridge/out";

export interface StaleFlagDeps<T> {
  status$: CoreStream<ConnectionStatus>;
  value$: CoreStream<T>;
}

/** The stale-flag fold (the RxJS core's reducer, imported) as
 * `Stream.runFoldEffect` over the merged sources, writing the flag through
 * `setRefIfChanged` (the `distinctUntilChanged`). Both ports are subscribed
 * at once through the machine's own `fromPortIn` — warm from creation, as
 * the RxJS `state$.subscribe()` is — and released when `dispose()` closes
 * the scope. A source failure has no channel on a ref: the machine's scope
 * closes and the cause is rethrown out of band (slice 2 ruling 8). */
export function createStaleFlagMachine<T>(
  deps: StaleFlagDeps<T>,
): ReadOnlyMachine<boolean> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(SubscriptionRef.make(false));
  const fromPort = fromPortIn(host.scope);
  const events = Stream.merge(
    fromPort(deps.status$).pipe(
      Stream.map((status): StaleFlagEvent<T> => {
        return { kind: "status", status };
      }),
    ),
    fromPort(deps.value$).pipe(
      Stream.map((value): StaleFlagEvent<T> => {
        return { kind: "value", value };
      }),
    ),
  );

  function close(): void {
    Effect.runFork(Scope.close(host.scope, Exit.void));
  }

  host.runtime.runFork(
    Stream.runFoldEffect(events, createStaleFlagAcc<T>(), (acc: StaleFlagAcc<T>, event) => {
      const next = reduceStaleFlag(acc, event);
      return setRefIfChanged(ref, () => {
        return next.stale;
      }).pipe(Effect.as(next));
    }).pipe(
      Effect.catchAllCause((cause) => {
        return Effect.sync(() => {
          if (!Cause.isInterruptedOnly(cause)) {
            close();
            reportOutOfBand(cause);
          }
        });
      }),
    ),
    { scope: host.scope },
  );

  return {
    state$: refToStateStream(host, ref),
    intents: {},
    dispose: close,
  };
}
```

`src/machines/tileExecution.ts`:

```ts
import { Duration, Effect, Exit, Fiber, Scope, SubscriptionRef } from "effect";

import {
  finishedTileExecution,
  isTerminalTileExecution,
  READY_TILE_EXECUTION,
  STARTED_TILE_EXECUTION,
  TIMED_OUT_TILE_EXECUTION,
  TIMEOUT_TILE_EXECUTION,
  TOO_LONG_TILE_EXECUTION,
} from "@rtc/client-core";
import type {
  Machine,
  Stream,
  TileExecutionIntents,
  TileExecutionState,
} from "@rtc/core-api";
import {
  CONFIRMATION_DISMISS_MS,
  type CurrencyPair,
  type Direction,
  EXECUTION_TIMEOUT_MS,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  type Price,
  TOO_LONG_THRESHOLD_MS,
} from "@rtc/domain";

import { createDetachedHost, refToStateStream, setRefIfChanged } from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

export interface TileExecutionDeps {
  /** The execute command (`TradeExecutionPresenter.execute`), injected so
   * timing is controllable in tests. */
  execute: (input: ExecuteTradeInput) => Stream<ExecuteTradeResult>;
}

/** The spec's Effect sketch: `Effect.race` of the RPC against
 * `Effect.sleep`, the too-long marker a forked sleep (a child of the run,
 * interrupted with it — so finishing cancels the escalation), switch-map
 * semantics `Fiber.interrupt` of the previous run; `dismiss()` interrupts
 * and resets; `dispose()` closes the machine's scope. A failing command is
 * `finished{Timeout}`, not the `timeout` state; the confirmation dismisses
 * itself after `CONFIRMATION_DISMISS_MS`. */
export function createTileExecutionMachine(
  pair: CurrencyPair,
  deps: TileExecutionDeps,
): Machine<TileExecutionState, TileExecutionIntents> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(SubscriptionRef.make<TileExecutionState>(READY_TILE_EXECUTION));
  // The live run's token and fiber. The token guards every write: a run
  // superseded a fiber-step ago cannot write over its successor's state
  // (interruption lands at the run's next suspension, not at the
  // `Fiber.interrupt` call).
  let active: object | null = null;
  let activeFiber: Fiber.RuntimeFiber<void> | null = null;
  let disposed = false;

  function endActive(): void {
    active = null;

    if (activeFiber !== null) {
      Effect.runFork(Fiber.interrupt(activeFiber));
      activeFiber = null;
    }
  }

  function startRun(input: ExecuteTradeInput): void {
    const token = {};
    active = token;

    function write(next: (current: TileExecutionState) => TileExecutionState): Effect.Effect<void> {
      return Effect.suspend(() => {
        return active === token ? setRefIfChanged(ref, next) : Effect.void;
      });
    }

    const body = Effect.gen(function* () {
      yield* write(() => {
        return STARTED_TILE_EXECUTION;
      });
      yield* Effect.fork(
        Effect.sleep(Duration.millis(TOO_LONG_THRESHOLD_MS)).pipe(
          Effect.andThen(write((current) => {
            return isTerminalTileExecution(current) ? current : TOO_LONG_TILE_EXECUTION;
          })),
        ),
      );
      const outcome = yield* Effect.race(
        rpc(deps.execute(input)).pipe(
          Effect.map(finishedTileExecution),
          Effect.catchAll(() => {
            return Effect.succeed(TIMED_OUT_TILE_EXECUTION);
          }),
        ),
        Effect.sleep(Duration.millis(EXECUTION_TIMEOUT_MS)).pipe(Effect.as(TIMEOUT_TILE_EXECUTION)),
      );
      yield* write(() => {
        return outcome;
      });
      yield* Effect.sleep(Duration.millis(CONFIRMATION_DISMISS_MS));
      yield* write(() => {
        return READY_TILE_EXECUTION;
      });
    });

    activeFiber = host.runtime.runFork(body, { scope: host.scope });
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {
      execute: (direction: Direction, price: Price, notional: number) => {
        if (disposed) {
          return;
        }

        endActive();
        startRun({ pair, direction, price, notional });
      },
      dismiss: () => {
        if (disposed) {
          return;
        }

        endActive();
        host.runtime.runSync(setRefIfChanged(ref, () => {
          return READY_TILE_EXECUTION;
        }));
      },
    },
    dispose: () => {
      disposed = true;
      endActive();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
```

Implementation notes: the token is assigned BEFORE the fork, because `runFork` runs the body synchronously up to its first suspension and `write`'s `Effect.suspend` reads `active` at that moment. Every synchronous `runSync` write in these machines (`notional`, `dismiss`) goes through `SubscriptionRef.set`'s semaphore; a fiber is never parked holding that permit across a suspension, so `runSync` does not suspend — if it ever throws `AsyncFiberException`, switch that write to `host.runtime.runFork(…, { scope: host.scope })`: a fork runs synchronously to its first suspension, so intent order is preserved. `Effect.race` interrupts the loser, so a timeout releases the in-flight port subscription (the harness then has nothing pending — the "late result" contract case passes as "no state change"). `Effect.catchAll` on the rpc turns a failing command into the Timeout-finished state and never the race's failure.

Run → all machine tests PASS.

- [ ] **Step 9: Composition**

`src/composition.ts` becomes:

```ts
import { Effect, Exit, ManagedRuntime, Scope } from "effect";

import {
  createApp as createRxjsApp,
  createMachineFactories as createRxjsMachineFactories,
} from "@rtc/client-core";
import type {
  App,
  AppPorts,
  CoreFactory,
  MachineFactories,
  Presenters,
} from "@rtc/core-api";
import type { CurrencyPair, ExecuteTradeInput } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createCommands } from "#/commands";
import { buildAppLayer, nativePresentersEffect } from "#/layers";
import { createNotionalMachine } from "#/machines/notional";
import { createRowHighlightMachine } from "#/machines/rowHighlight";
import { createStaleFlagMachine } from "#/machines/staleFlag";
import { createTileExecutionMachine } from "#/machines/tileExecution";
import { HostTag } from "#/services";

/** What `composeWithBase` hands back: the RxJS app it delegated to, the app
 * this core presents, and the Effect host the app owns — exposed so the
 * teardown guarantee is observable from a test rather than taken on trust. */
export interface ComposedApp {
  base: App;
  app: App;
  host: EffectHost;
}

/** The machine-factory twin of `ComposedApp`. */
export interface ComposedMachines {
  base: MachineFactories;
  machines: MachineFactories;
}

/** The app is a `ManagedRuntime` over the native Layer graph (`layers.ts`):
 * every native presenter is a service, `AppPorts` enters as
 * `Layer.succeed`, the host is a scoped Layer, and ONE `runSync` resolves
 * the `Presenters` overlay — slice 2's Tag/Layer composition (ADR-006).
 * Everything not in the graph still delegates to the RxJS core;
 * `parity.json` records which is which and `parity.test.ts` proves it. */
export function composeWithBase(ports: AppPorts): ComposedApp {
  const base = createRxjsApp(ports);
  const runtime = ManagedRuntime.make(buildAppLayer(ports));
  const { host, presenters } = runtime.runSync(
    Effect.all({ host: HostTag, presenters: nativePresentersEffect }),
  );
  const app: App = {
    ...base,
    presenters: { ...base.presenters, ...presenters },
    commands: createCommands(),
    // Order matters: the RxJS app goes first (its teardown may still drive
    // streams this core bridged), THEN the host scope interrupts whatever
    // fibers remain — every fold period and retained singleton is forked
    // from it — and only then is the runtime disposed, which closes the
    // Layer scope the host's is a child of (a no-op by then). Every step is
    // in a `finally` so one rejection cannot skip the rest; each is
    // idempotent, so calling `dispose()` twice is safe.
    dispose: async () => {
      try {
        await base.dispose();
      } finally {
        try {
          await Effect.runPromise(Scope.close(host.scope, Exit.void));
        } finally {
          await runtime.dispose();
        }
      }
    },
  };
  return { base, app, host };
}

export function createApp(ports: AppPorts): App {
  return composeWithBase(ports).app;
}

/** Native machine factories, closing over the SAME merged `presenters` the
 * RxJS builder gets. Each machine owns a detached host (slice 2 ruling 8). */
function nativeMachines(presenters: Presenters): Partial<MachineFactories> {
  return {
    tileExecution: (pair: CurrencyPair) => {
      return createTileExecutionMachine(pair, {
        execute: (input: ExecuteTradeInput) => {
          return presenters.execution.execute(input);
        },
      });
    },
    staleFlag: (pair: CurrencyPair) => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.priceStream.price$(pair),
      });
    },
    analyticsStaleFlag: () => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.analytics.position$,
      });
    },
    rowHighlight: (isNew: boolean) => {
      return createRowHighlightMachine(isNew);
    },
    notional: (defaultNotional: number) => {
      return createNotionalMachine(defaultNotional);
    },
  };
}

export function composeMachinesWithBase(presenters: Presenters): ComposedMachines {
  const base = createRxjsMachineFactories(presenters);
  return { base, machines: { ...base, ...nativeMachines(presenters) } };
}

export function createMachineFactories(presenters: Presenters): MachineFactories {
  return composeMachinesWithBase(presenters).machines;
}

export const effectCore: CoreFactory = { createApp, createMachineFactories };
```

Tests: `src/composition.machineFactories.test.ts` (as Task 4's, over this core's `createMachineFactories`); extend `src/composition.dispose.test.ts` (or create it): "dispose() closes the host scope: a retained singleton's port is released", "dispose() twice is safe", "ONE runSync: `composeWithBase` builds without an async boundary" (wrap in `expect(() => composeWithBase(ports)).not.toThrow()` — an async Layer build would throw `AsyncFiberException` from `runSync`).

- [ ] **Step 10: `parity.json`, `index.ts`, README**

`src/parity.json`: the same eleven flips as Task 4 Step 10.

`src/index.ts`: export `rpc` (from `#/bridge/rpc`), `EffectRunner`, `runnerFor`, `createDetachedHost`, `setRefIfChanged`, `fromPortIn`, `reportOutOfBand`, `MirrorOptions`, `conflatedFold`, the six presenter factories, the four machine factories (+ `StaleFlagDeps`, `TileExecutionDeps`), `AppPortsTag`, `HostTag`, `HostLive`, `presenterLayer`, and from `#/layers` the tags, `buildAppLayer`, `nativePresentersEffect`, `NativeServices`.

`README.md`: "Shape" gains a paragraph on the Layer graph (`services.ts`, `layers.ts`, one `runSync`, `HostLive` as the scope owner, `PowerSaverLive` memoised into two dependents); "Bridge" gains `rpc` (own file, lazy), `fromPortIn`, `setRefIfChanged`, `createDetachedHost`, `reportOutOfBand`, `SharedFold.retain`; a new "Conflation and machines" section (`conflatedFold` hand-rolls the leading+trailing throttle — ruling 7; a machine = `SubscriptionRef` + detached host; failure out of band); "Parity" 28/71 with the eleven names.

- [ ] **Step 11: The package gate**

```bash
pnpm --filter @rtc/client-core-effect build
pnpm --filter @rtc/client-core-effect typecheck
pnpm --filter @rtc/client-core-effect test
pnpm --filter @rtc/client-core-effect test:coverage
pnpm exec biome ci packages/client-core-effect
pnpm exec eslint packages/client-core-effect/src
pnpm exec depcruise --config .dependency-cruiser.cjs packages/client-core-effect/src
```

Expected: the runner green on every slice-2 suite with the members native; `parity.test.ts` proves the eleven; coverage ≥95/95/95/85; lint and the cruiser clean (`effect-port-subscription-owned-by-the-bridge` still passes: only `bridge/out.ts` imports `bridge/in.ts`). `pnpm core:parity` → `native: effect 28/71`.

- [ ] **Step 12: Commit (by pathspec)**

```bash
git add packages/client-core-effect .dependency-cruiser.cjs
git commit -- packages/client-core-effect .dependency-cruiser.cjs -m "feat(client-core-effect): slice 2 — Tag/Layer composition; FX pricing, blotter, execution and five machines native; retained folds, conflation, rpc bridge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

(Drop `.dependency-cruiser.cjs` from both commands if you did not touch it.)

---

### Task 6: Docs, status, and the slice gate — then ship PR B

**Files:**
- Modify: `docs/adr/ADR-006-pluggable-application-core.md` (a "Decided in slice 2" block after "Decided in the residual sweep", before `## Follow-ups`)
- Modify: `docs/architecture/22-pluggable-application-core.md` ("The contract tier" count; "The parity manifest" count; a new section "Warm singletons, conflation and machines" after "Failure, teardown and port discipline")
- Modify: `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md` (the "Effect core" bullet's "Deferred to slice 2" sentence; a receipt line after the residual-sweep one)
- Modify: `CLAUDE.md` (four count edits), `docs/STATUS.md` (headline → slice 3)

**Interfaces:** consumes the merged Tasks 4–5 (both cores at 28/71).

- [ ] **Step 1: ADR-006 — "Decided in slice 2"**

Insert after the last bullet of "Decided in the residual sweep":

```
**Decided in slice 2** (2026-09-19):

- **Suites shipped ahead of the ports, as their own PR.** The ordering rule
  ("green on RxJS first") is a merge boundary, not a task order: the ports
  are judged against a fixed target, and a reviewer can accept the suites
  and reject a port.
- **The pure folds are exported from `@rtc/client-core` and imported by both
  siblings** (`blotterFolds`, `staleFlagFold`, `notionalView`,
  `tileExecutionState`), and the four app-layer timings/caps the suites need
  live in `@rtc/domain` (`PRICE_CONFLATION_MS`, `PRICE_HISTORY_CONFLATION_MS`,
  `BLOTTER_ROW_HIGHLIGHT_MS`, `ACTIVITY_FEED_CAP`) — the contract tier may
  not import `client-core`. The fold under test is the same function driven
  by a different runtime; slice 8 moves the folds to `@rtc/core-logic`.
- **`warmReplay` has a name in each sibling:** `TopicOptions.retainUntil`
  (an `AbortSignal` the app mints and aborts in `dispose()`, before the base
  app) and `SharedFold.retain` (the host scope ends the period). Four
  members use it: the three singletons and `blotter.activity$`.
- **Conflation is hand-written in both siblings**, as `conflateWhen` is in
  the RxJS core: neither runtime ships a leading+trailing throttle gated by
  a flag (Effect's `Stream.throttle` is a token bucket, `aggregateWithin`
  trailing-only). One producer per core, inside the one place its runtime
  allows a timer. A flip takes effect at once; a trailing value pending when
  the flag turns off is discarded (uncontracted); values before the flag has
  spoken are dropped.
- **Machines own their lifetime.** `createMachineFactories(presenters)` has
  no app handle, so an async machine is a `Store` plus an `AbortController`
  and an Effect machine is a `SubscriptionRef` under a detached host
  (`Runtime.defaultRuntime` + its own `Scope`). A machine's source failure
  has no channel on either — the RxJS `state()` would error `state$`, which
  nothing observes — so it aborts the machine and is rethrown out of band.
- **The Effect core composes as `Context.GenericTag` services in a `Layer`
  graph** (`services.ts`, `layers.ts`): `AppPorts` enters as
  `Layer.succeed`, the host is a `Layer.scoped` owning a closeable child
  scope, every native presenter is a `Layer`, `createApp` is
  `ManagedRuntime.make(buildAppLayer(ports))` and ONE synchronous `runSync`.
  `PowerSaverLive` is merged into the app AND provided to the two dependents;
  Layer memoisation makes it one instance. `GenericTag` rather than the class
  form because a class must name its file. `EffectHost.runtime` is the
  structural `EffectRunner`, so a `ManagedRuntime` (tests) and a captured
  `Runtime` (the Layer) both serve.
- **`rpc` is a bridge file of its own** (`bridge/rpc.ts`): lazy, so the
  eager-subscription rule that confines `bridge/in.ts` does not apply to it.
- **A one-shot command result completes** (`execute(input)`): the slice-1b
  ruling was about presenter STREAMS; an RPC result's source ends.
- **`executions$` is asserted only after `settle()` following subscribe**
  — the Effect `PubSub` subscription is taken on the subscriber's fiber; a
  publish in that gap reaches nobody, as on an RxJS `Subject` with no
  observer.
- **Fake timers are the suite's, not the harness's** (`withFakeClock`): the
  harness is built inside the fake clock; `clock.settle()` replaces
  `settle()` there; Effect's live `Clock` sleeps on the global `setTimeout`,
  which vitest fakes (measured, `bridge/clock.test.ts`).
```

- [ ] **Step 2: §22**

- "The contract tier": replace `At slice 0, six members have real suites (`connection`, `themePreference`, `themeSkinPreference`, `viewModePreference`, `powerSaver`, `commands.reconnect` — slice 1a's scope) and 65 are pending.` with `As of slice 2, twenty-eight members have real suites — slice 1a's six, slice 1b's eleven, and slice 2's eleven (`priceStream`, `priceHistory`, `currencyPairs`, `blotter`, `analytics`, `execution`; `staleFlag`, `analyticsStaleFlag`, `rowHighlight`, `notional`, `tileExecution`) — and 43 are pending.` Also replace `advances vitest's fake timers` with `advances vitest's fake timers where a member is timer-driven (`withFakeClock`, built around one `it`; `settle()` otherwise)`, and `Subject-backed streams, an intent-named `driver`` with `Subject-backed streams for the connection, the colour scheme and the five FX ports, an intent-named `driver` — `tickPrice`, `resolveExecution`, `emitTrades`, …`.
- "The parity manifest": replace `As of slice 1b both alternative cores list seventeen members `"native"` (`connection`, all fifteen preference presenters, `commands.reconnect`)` with `As of slice 2 both alternative cores list twenty-eight members `"native"` (`connection`, all fifteen preference presenters, `commands.reconnect`, the six FX pricing/blotter presenters and the five FX machines)`.
- New section, inserted after "Failure, teardown and port discipline" and before "The contract tier":

```
## Warm singletons, conflation and machines

Slice 2 added the three shapes the FX members need, each stated once per
core:

- **Warm singletons** (`currencyPairs.pairs$`, `blotter.trades$`,
  `blotter.activity$`, `analytics.position$`): the RxJS `warmReplay()`
  (`shareReplay({ refCount: false })`) keeps the port subscribed for the
  session. The async core's `Topic` takes `retainUntil: AbortSignal` — the
  app mints it in `composeWithBase` and aborts it in `dispose()` before the
  base app is disposed; the Effect core's `SharedFold` takes `retain: true`
  — the last unsubscribe does not end the period, the host scope does.
  Subscribers attached when the app is disposed hear nothing more.
- **Conflation** (`priceStream`, `priceHistory` under `powerSaver.isCalm$`):
  a leading+trailing throttle gated by a flag with immediate effect. The
  async core writes it as one Topic producer with a window
  `AbortController` (`createConflatedTopic`); the Effect core as a
  `sharedFold` whose `run` holds a `Ref<ConflationState>` moved by atomic
  `Ref.modify` transitions and a forked `Effect.sleep` (`conflatedFold`).
  Neither runtime ships the operator. Uncontracted edge: a trailing value
  pending when the flag turns off is discarded, as the RxJS `switchMap`
  discards it.
- **Machines** (`staleFlag`, `analyticsStaleFlag`, `rowHighlight`, `notional`,
  `tileExecution`): `createMachineFactories(presenters)` has no app handle,
  so a machine owns its lifetime — a `Store` plus an `AbortController`
  (async), a `SubscriptionRef` under a detached host with its own `Scope`
  (Effect); `dispose()` aborts or closes it. The tile execution is the
  spec's sketch in both: one run per `execute()`, cancelled by the next
  `execute()`, by `dismiss()` and by `dispose()`; a `race` between the RPC
  and the timeout; a too-long marker that a terminal state ignores. A
  machine's source failure has no channel on a `Store`/`SubscriptionRef`
  and is rethrown out of band (`reportAsync` / `reportOutOfBand`).
- **The Effect Layer graph.** `priceStream` gating on `powerSaver.isCalm$`
  is the first native-on-native dependency, and the reason the Effect core
  now composes as services: `services.ts` (`AppPortsTag`, `HostTag`,
  `HostLive`, `presenterLayer`), `layers.ts` (one `GenericTag` + one `Live`
  layer per native presenter, `buildAppLayer(ports)`), and a
  `composeWithBase` that is `ManagedRuntime.make` + one `runSync`. The pure
  folds the FX members run are `@rtc/client-core` exports in all three cores
  (`blotterFolds`, `staleFlagFold`, `notionalView`, `tileExecutionState`);
  their timing constants live in `@rtc/domain`.
```

- [ ] **Step 3: Spec receipts**

In "The Effect core", replace `**Deferred to slice 2:** the Tag/Layer shape buys nothing while no native member depends on another native member; `priceStream` (which consumes `powerSaver.isCalm$`) is the first such dependency. Slice 1a keeps slice 0's plain-object overlay with `host` injected.` with `**Landed in slice 2:** `Context.GenericTag` services + one `Layer` per native presenter (`layers.ts`), `AppPorts` as `Layer.succeed`, the host as `Layer.scoped`, `createApp` = `ManagedRuntime.make(buildAppLayer(ports))` + one `runSync`; `priceStream` gating on `powerSaver.isCalm$` was the first native-on-native dependency.` In the same bullet list, after "Conflation / rolling windows are `Stream` combinators, not a hand-rolled kernel — that is the point of the comparison." append ` **Amended in slice 2:** a leading+trailing throttle gated by a flag is not a shipped combinator; `conflatedFold` hand-rolls it inside a fold's `run` (ADR-006, "Decided in slice 2").` In "The async/await core", after the tile-execution code block's sentence "intents.execute aborts the previous controller and spawns run(); dismiss aborts and resets." append ` Shipped as written in slice 2 (`machines/tileExecution.ts`).` After the residual-sweep receipt line append:

```
Slice 2 shipped 2026-09-19 (plan: [`../plans/2026-09-19-pluggable-core-slice-2.md`](../plans/2026-09-19-pluggable-core-slice-2.md)) — suites as PR A, ports as PR B; 28/71 native in both alternative cores; the Effect core composes as a Layer graph.
```

- [ ] **Step 4: `CLAUDE.md`** — four edits:
  - "Current Status": `with seventeen members native in both alternative cores as of slice 1b — connection, every preference presenter, `commands.reconnect` —` → `with twenty-eight members native in both alternative cores as of slice 2 — connection, every preference presenter, `commands.reconnect`, the FX pricing/blotter/execution presenters and their five machines —`.
  - Package table, `client-core-async` row: `Slice 1b: seventeen members native (connection, all fifteen preference presenters, commands.reconnect), the rest delegate to @rtc/client-core;` → `Slice 2: twenty-eight members native (connection, all fifteen preference presenters, commands.reconnect, the six FX pricing/blotter presenters, the five FX machines), the rest delegate to @rtc/client-core;`. `client-core-effect` row: `ManagedRuntime-owning composition root, Stream/SubscriptionRef bridge. Slice 1b: seventeen members native, the rest delegate to @rtc/client-core.` → `Context/Layer composition root over a ManagedRuntime (one runSync resolves the native presenters), Stream/SubscriptionRef bridge. Slice 2: twenty-eight members native, the rest delegate to @rtc/client-core.`
  - "Application core rule": `(seventeen native as of slice 1b: `connection`, every preference presenter, `commands.reconnect`)` → `(twenty-eight native as of slice 2: `connection`, every preference presenter, `commands.reconnect`, the FX pricing/blotter/execution presenters and their machines)`.

- [ ] **Step 5: `docs/STATUS.md`** — the pluggable-core entry:
  - Headline: `**slice 0 shipped (#717, 2026-09-13); slice 1a shipped (#764, 2026-09-19); slice 1b shipped (2026-09-19); next: slice 2 (FX pricing + blotter)**` → `**slice 0 shipped (#717, 2026-09-13); slice 1a shipped (#764, 2026-09-19); slice 1b shipped (#772, 2026-09-19); slice 2 shipped (2026-09-19); next: slice 3 (credit)**`.
  - Member sentence: replace from `— both alt cores go native for `priceStream`,` up to and including `as is the `sharedFold` watcher latch.` with `— both alt cores go native for `rfqs`, `dealers`, `instruments`, `rfqQuote` and the machines `rfqTile`, `rfqSubmission`, `ticketSubmission` (the `@rx-state` submissions and the RFQ reducer, `RfqCountdownMachine`); their suites do not exist yet and must be green on RxJS first (slice 2's two-PR shape: suites, then ports).`
  - Plan links: append ` · Plan (slice 2): [superpowers/plans/2026-09-19-pluggable-core-slice-2.md](superpowers/plans/2026-09-19-pluggable-core-slice-2.md)`.
  - Bump `**Last updated:**` if the date moved.

- [ ] **Step 6: Doc links and formatting**

```bash
pnpm check:doc-links
pnpm exec biome ci .
```

- [ ] **Step 7: The local CI mirror (one gauntlet for PR B)**

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @rtc/client-core-async test:coverage
pnpm --filter @rtc/client-core-effect test:coverage
pnpm check:deps
pnpm --filter @rtc/tests gates
pnpm check:core-bundle
pnpm core:parity
```

Expected: all green. `pnpm core:parity` prints `native: async 28/71, effect 28/71`. `check:core-bundle` reports no foreign-core marker in the rxjs builds; note the gzip sizes per core in the PR body — the Effect bundle grows with `Context`/`Layer`/`PubSub`; the rxjs build must not move beyond noise. Task 6 runs alone, so the repo-wide build is safe.

- [ ] **Step 8: The e2e matrix — the slice's exit criterion**

```bash
pnpm test:e2e
pnpm test:e2e:async
pnpm test:e2e:effect
```

Run each unpiped and read the summary block yourself — never `tail`/`grep` a Playwright run you are judging. Expected: all three legs green on both clients (82+82 Playwright, 47+47 Cucumber per leg at the residual sweep; the count may have moved). The FX tile, blotter and analytics specs now run over native members on the two alternative legs. The `rxjs` leg has moved code (Task 1's folds) and runs here too.

- [ ] **Step 9: Commit and ship PR B**

```bash
git add docs CLAUDE.md
git commit -m "docs(pluggable-core): slice 2 receipts — parity 28/71, Layer graph, warm singletons and conflation, STATUS to slice 3

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

Ship per the repo's shipping rules: push, open the PR (title `feat(pluggable-core): slice 2 — FX pricing + blotter native in both cores; Effect Tag/Layer composition`; body: the eleven members, the `pnpm core:parity` table, the gzip sizes, the rulings that changed shape mid-execution), loop until CI is green on the head SHA (all four required jobs), check CodeQL alerts, merge with `--merge`, confirm the merge commit is an ancestor of `origin/main`, clean up the worktree. Commit the SDD rulings file next to this plan before removing the worktree (memory: `commit-sdd-rulings-before-cleanup`).

---

## Self-review

**Spec coverage (slice 2 row + "done when"):** suites exist and are green on RxJS — Task 3 (PR A); both alternative cores native for the six presenters and five machines — Tasks 4 and 5; e2e matrix green — Task 6 Step 8; `parity.json` updated — Tasks 4/5 Step 10. Spec "why here": conflation — `createConflatedTopic` / `conflatedFold` + the priceStream/priceHistory suites' fake-clock cases; memoised identity — the first case of both per-key suites; the racing machine — `tileExecution` in both cores + seven suite cases. Spec "The async/await core" tile sketch — Task 4 Step 8 is that sketch. Spec "The Effect core": Tag/Layer composition — Task 5 Steps 3–4 and 9; `Effect.race` / forked too-long sleep / `Fiber.interrupt` — Task 5 Step 8; `Stream.share` for conflation — amended (ruling 7, Task 6 Step 3). Spec "The core-contract tier": driver verbs `tickPrice`, `resolveExecution`, `failExecution` — Task 2; "Time is vitest fake timers for all three cores" — Task 2's `withFakeClock`, Task 5's measurement gate. STATUS's "Tag/Layer composition for the Effect core is due here" — Task 5. Documentation per the spec — Task 6.

**Placeholder scan:** no TBD/TODO. Every code step carries the code, except where a file is a stated twin of one shown in full in the same task (`analytics.ts` of `currencyPairs.ts`; `analyticsStaleFlag.ts` of `staleFlag.ts`; the Effect `priceHistory.ts` of `priceStream.ts`; Task 5's presenter/machine unit tests of Task 4's, whose cases are listed) — each twin names exactly what differs. Task 4 Step 8's machine tests and Task 5's tests are listed by case name with the assertion stated, not written out; the implementer writes them against the code that IS written out. The `ids` helper in the blotter suite and the `as { executionStatus }` cast in the tile suite each carry their lint fallback.

**Type consistency:** `createConflatedTopic(source: Observable<T>, calm$: Stream<boolean>, ms): Topic<T>` — called with `useCase.execute(pair)` (an `Observable<Price>`), `isCalm$` (a `Stream<boolean>` from `PowerSaverPresenter`), a domain constant ✓. `topicToStreamWithLead(topic, () => Peeked<T> | null)` — `Peeked` is `bridge/in`'s box ✓. `promiseToStream((signal) => Promise<T>)` ↔ `once(source, signal)` rejecting `AbortError` ✓. `relayTopic(source: Topic<T>, signal, next)` used by `mapTopic`, `blotter.ts` ✓. `TopicOptions.retainUntil?: AbortSignal` ↔ `topicFromObservable(source, retainUntil?)` ↔ `createCurrencyPairsPresenter(referenceData, lifetime: AbortSignal)` ↔ `composeWithBase`'s `lifetime.signal` ✓. Effect: `EffectHost.runtime: EffectRunner` ↔ `runnerFor(Runtime.Runtime<never>)` ↔ `HostLive`'s `Effect.runtime<never>()` ↔ `createDetachedHost()`'s `Runtime.defaultRuntime` ✓; `Context.GenericTag<S>` is `Tag<S, S>` ↔ `presenterLayer<S>(tag: Context.Tag<S, S>, …): Layer<S, never, EffectHost | AppPorts>` ↔ `NativeServices` as a union of the 22 presenter interfaces ↔ `buildAppLayer(ports): Layer.Layer<NativeServices>` ✓. `SharedFold.retain` ↔ `MirrorOptions.retain` ↔ `mirrorPortAsIs(host, source, { retain: true })` ✓. `fromPortIn(scope): FromPort` ↔ `FromPort = <T>(source: CoreStream<T>) => Stream.Stream<T, unknown>` ✓. `setRefIfChanged(ref, next)` ↔ every machine ✓. `conflatedFold(host, source, calm$, ms, seed: () => Option<T>)` ↔ `priceStream` (`Option.none()`), `priceHistory` (`Option.some([...retained])`) ✓. Folds: `reduceActivity(acc, trades, now: number)` — RxJS `Date.now()`, async `now()`, Effect `now()` ✓; `StaleFlagEvent<T>` shape `{ kind: "status", status } | { kind: "value", value }` at all four sites ✓; `finishedTileExecution(result: ExecuteTradeResult)` ↔ `once(...).then(finishedTileExecution, …)` and `Effect.map(finishedTileExecution)` ✓. Harness: `PortMethodName` gains the three names `portDiscipline` cases use ✓; `pendingExecutions(): readonly ExecutionRequest[]` ↔ the execution and tile suites' `.spotRate`/`.notional`/`.currencyPair` reads ✓; `createPrice` returns a `Price` ↔ `tileExecution.execute(direction, price: Price, notional)` ✓; `KNOWN_CURRENCY_PAIRS` symbols `EURUSD`/`GBPUSD` exist in `packages/domain/src/fx/currencyPair.ts` ✓. `PowerSaverLevel` literals `"off" | "calm" | "freeze"`, default `"off"` — verified in `packages/domain/src/preferences/preferences.ts` ✓. `ConnectionEvent` types used (`gatewayConnected`, `gatewayDisconnected`, `idleTimeout`) exist ✓. `parity.json` keys are the `Presenters`/`MachineFactories` member names ✓.
