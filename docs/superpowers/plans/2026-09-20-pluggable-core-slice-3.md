# Pluggable Application Core — Slice 3 (Credit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the four credit presenters — `rfqs`, `dealers`, `instruments`, `rfqQuote` — and the four RFQ machines — `rfqTile`, `rfqSubmission`, `ticketSubmission`, and the newly seam-exposed `rfqCountdown` — a behavioural contract suite each (green on the RxJS core first), then a native implementation in both alternative cores, so `pnpm core:parity` reads 36/73 for each core.

**Architecture:** Two PRs, the slice-2 shape. **PR A (Tasks 1–3, "the RxJS side")** exposes the credit countdown through the `MachineFactories` seam (`rfqCountdown` — today both bindings import `createRfqCountdownMachine` from `@rtc/client-core` directly, which no alternative core can intercept), moves the two RFQ cadence constants the suites need into `@rtc/domain`, exports the one pure helper both siblings need (`shallowArrayEquals` + `createShallowArrayMemo`) from `@rtc/client-core` and the RFQ reducer's empty state from `@rtc/domain`, extends the `@rtc/core-contract` harness with scripted credit ports (`workflow`, `dealers`, `instruments`, and `pricing.getRfqQuote` become `Subject`/pending-queue-backed with intent-named driver verbs), and lands the eight suites — green on all three runners, meaningfully only on RxJS while the siblings still delegate. **PR B (Tasks 4–6, "the ports")** makes the eight members native with no new kernel primitive in either sibling: the async core builds them from `Topic`/`Store`/`once`/`promiseToStream`; the Effect core from `sharedFold`/`mirrorPort`/`rpc`/`SubscriptionRef` plus four more `GenericTag` + `Live` layers. Task 6 records receipts (ADR-006 "Decided in slice 3", §22, CLAUDE.md, READMEs, STATUS to slice 4) and runs the gate: gauntlet + the three-leg e2e matrix.

**Tech Stack:** TypeScript 7 `tsc` (6.x API shim for tooling — see `docs/typescript-7.md`), pnpm 12 workspaces + Turborepo (strict env), vitest 4.1 (fake timers via `vi.useFakeTimers` / `vi.advanceTimersByTimeAsync`), RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2 (`Context`, `Layer`, `SubscriptionRef`, `Stream`, `Effect.sleep`, `Fiber.interrupt`), dependency-cruiser, knip, Playwright.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md) — slice table row "3 credit" (`rfqs`, `dealers`, `instruments`, `rfqQuote`; machines `rfqTile`, `rfqSubmission`, `ticketSubmission`, `RfqCountdownMachine` — "the `@rx-state` submissions and the RFQ reducer"); "The async/await core" ("Pure reducers … are imported, not duplicated"); "The Effect core" (Tag/Layer composition); "The core-contract tier". Slice 2 shipped as PRs #793 (suites) and #794 (ports) from [`2026-09-19-pluggable-core-slice-2.md`](2026-09-19-pluggable-core-slice-2.md) with its rulings in [`2026-09-19-pluggable-core-slice-2-rulings.md`](2026-09-19-pluggable-core-slice-2-rulings.md); every primitive this slice builds on (`retainUntil`, `once(source, signal)`, `promiseToStream`, `Store` machines, `sharedFold.retain`, `mirrorPort`, `rpc`, `createDetachedHost`, `setRefIfChanged`, the Layer graph) is as that plan left it, and PR #795's `check-dist` guard is in every build.

**Rulings:** [`2026-09-20-pluggable-core-slice-3-rulings.md`](2026-09-20-pluggable-core-slice-3-rulings.md) — every ruling made while executing this plan, each with what it costs if wrong, plus the deferred minors and their triage. The sixteen rulings recorded up front are below.

## Global Constraints

- **Exit criterion (spec, "Slices 1a–7"):** suites for the eight members exist and are green on RxJS (PR A); both alternative cores have them native (PR B); the e2e matrix (`test:e2e`, `test:e2e:async`, `test:e2e:effect`) is green; `parity.json` updated in both cores (36/73 each).
- **Ordering rule (spec):** a member's suite is green on RxJS before either alternative core ports it. PR A merges before Task 4 or 5 starts; Tasks 4–5 run in a worktree created off the `main` that contains PR A.
- **Bridge rule:** outside `packages/client-core-{async,effect}/src/bridge/`, `rxjs` and `@rx-state/core` are **type-only** imports (dependency-cruiser `bridge-owns-rxjs` + grep gate 43; `.test.ts` exempt). This slice constructs **no** new `Observable` in either sibling — every stream comes from an existing bridge export (`topicToStream`, `promiseToStream`, `storeToStateStream`, `streamToStream`, `refToStateStream`). `effect` is importable only inside `packages/client-core-effect/` (`effect-only-in-client-core-effect`). Outside `bridge/`, the Effect core reaches `fromObservable` only through a `FromPort` (`effect-port-subscription-owned-by-the-bridge`).
- **Types-only rule:** `packages/core-api/src` exports no runtime value (grep gate 42). Task 1 adds ONE type member (`MachineFactories.rfqCountdown`) and nothing else. `@rtc/core-contract` never imports `@rtc/client-core` (build-order cycle) — constants the suites need move to `@rtc/domain` (Task 1), never to `client-core`.
- **Pure reducers and helpers are imported, never duplicated** (spec, "The async/await core"): `reduceRfqEvent` + `createEmptyRfqStreamState` from `@rtc/domain`; `shallowArrayEquals` + `createShallowArrayMemo` from `@rtc/client-core`. A sibling that re-implements either is a review finding.
- **Workspace packages resolve through `dist`** (`exports` → `./dist/index.js`, no vitest alias). After Task 1: `pnpm --filter @rtc/domain build && pnpm --filter @rtc/core-api build && pnpm --filter @rtc/client-core build`; after Task 2/3: `pnpm --filter @rtc/core-contract build` — before running any dependent's tests. A stale `dist` gives a false result in either direction. **Parallel implementers on one worktree must not run a repo-wide `pnpm build` mid-wave, and must not run two `--filter` builds at once** — a `--filter`ed `tsc --build` also rebuilds the projects it references, and two such builds can truncate a shared `.d.ts` (CLAUDE.md "Never run two builds in one checkout at once"; PR #795's `check-dist` fails the build that observes it, and its message carries the recovery recipe). Serialise builds between implementers: Task 1 builds `domain`/`core-api`/`client-core`; Task 2 builds `core-contract` only AFTER Task 1's commit lands (it references `core-api` and `domain`).
- **Shared dep versions must match the repo exactly** (`pnpm check:versions`). This slice adds no dependency.
- **Coverage gates:** each alternative core's `test:coverage` must stay ≥95% statements/lines/functions and ≥85% branches. The contract runner (`src/coreContract.test.ts`) exercises every member through the eight suites; unit tests cover what the contract cannot see (port release on abort/interrupt, the wrong-state intent guards, the Layer graph count).
- **Biome + ESLint:** mandatory braces on every control statement; arrow functions use block bodies with an explicit `return`; zero findings; no `biome-ignore`/`eslint-disable`. `func-style` forbids `const f = () => {}` and `let f = () => {}` — named functions are `function` declarations; a `let` holder for a later-assigned closure is declared WITHOUT an initializer. Exported functions carry explicit return types. No inline object type literal in a return-type or parameter position — name an `interface`. A class must name its file (`rtc/class-filename-match`) — the Effect tags stay `Context.GenericTag`. Function names state their effect (`rtc/name-functions-by-effect`); fixture factories are `create*` (`rtc/name-fixture-factories`); test files put tests before helpers (`rtc/newspaper-order`).
- `#/` subpath imports only; never `@/`; ≥2-up relative imports are banned.
- **Port discipline (residual sweep):** an app-lifetime port method (`workflow.events`, `dealers.getDealers`, `instruments.getInstruments`) is called at construction only, in every core; `portDiscipline` gains one constancy case per member. A one-shot command method (`workflow.createRfq/accept/cancelRfq/pass/quote`, `pricing.getRfqQuote`) is called per invocation — that IS its contract — and is NOT under the constancy rule.
- **Only the first value is synchronous (slice 1a ruling):** suites assert a subscription's first value in the caller's tick and every later value after `settle()` — or, under the fake clock, after `clock.settle()`. **Never call the real `settle()` while fake timers are installed.**
- **Equal-state conflation stays uncontracted:** an Effect fold drops an `Object.is`-equal consecutive state; the RxJS `state()`/`scan` and the async `Store` differ (`Store` drops, `state()` re-emits). No suite asserts a re-emission of an unchanged value — a ticket submission that fails back to `{ submitted: false }`, a countdown tick equal to its seed. Suites read `values.at(-1)` and assert what is ABSENT (`no true ever`) where the RxJS core may or may not re-emit.
- **No new env vars, scripts, packages or CI jobs.** Selection, matrix and gates from slice 0 are reused as-is.
- Commit after every task with the repo's trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH
  ```

## Rulings recorded up front

1. **Two PRs, suites first** — slice 2 ruling 1, unchanged. Cost if wrong: one extra CI cycle.
2. **`rfqCountdown` joins `MachineFactories`.** The spec lists `RfqCountdownMachine` under slice 3, but it is not a seam member today: both bindings build it by importing `createRfqCountdownMachine` from `@rtc/client-core` directly (`react-bindings/src/createViewModel.ts:1323`, `solid-bindings/src/createViewModel.ts:1389`), so under `VITE_CORE_IMPL=async|effect` the credit RFQ card would still tick on an RxJS `timer` whatever the cores do. A member the seam cannot route is not portable, so it becomes `MachineFactories.rfqCountdown(creationTimestamp, totalMs): ReadOnlyMachine<number>`; the RxJS `createMachineFactories` gains the entry; both bindings call `machines.rfqCountdown(...)`; the two `viewModelFromWorld.ts` UI-contract harnesses keep their direct import (they build their own view model and are not the seam). The contract registry gains the key (compile-enforced), both `parity.json` files gain `"rfqCountdown": "delegated"` in PR A (their drift test lists every registry member), and the core-api factory-key test goes from eleven to twelve. Member count 72 → 73; "36/73" is the slice's number. Cost if wrong: one type member and four one-line call sites.
3. **Two constants move to `@rtc/domain`:** `RFQ_COUNTDOWN_INTERVAL_MS = 100` (in `fx/trade.ts`, beside `RFQ_TIMEOUT_MS` and `REJECTED_DISPLAY_MS` — `RfqTileMachine` and `RfqCountdownMachine` each carry a private copy today) and `RFQ_REDIRECT_DELAY_MS = 1_500` (in `credit/rfq.ts` — `RfqsPresenter`'s private `REDIRECT_DELAY_MS`). The suites drive both edges to the millisecond and may not import `client-core`. The RxJS files keep their local names as aliases of the domain values. Cost if wrong: a rename.
4. **`createEmptyRfqStreamState` is exported from `@rtc/domain`.** `WorkflowEventStreamUseCase.ts`'s private `emptyState()` is the reducer's seed; a sibling that runs `scan(reduceRfqEvent, seed)` under its own runtime needs the same seed, and "pure reducers are imported" covers the seed as much as the step. Cost if wrong: an export.
5. **`shallowArrayEquals` + `createShallowArrayMemo` are exported from `@rtc/client-core`** (`presenters/shallowArrayEquals.ts`). `rfqs$` and `quotesForRfq$` are `map` + `distinctUntilChanged(shallowArrayEquals)` in the RxJS core: a new array per event, suppressed when element-wise equal. The siblings get the SAME suppression through one memo: `createShallowArrayMemo(project)` returns the PREVIOUS array when the projection is shallow-equal, so the async `deriveDistinct` (reference-equality) and the Effect `mirrorPort` (`Object.is` conflation) both drop it for free. This is a contracted behaviour, not a conflation courtesy — `rfqs$` after `endOfStateOfTheWorld` does not re-emit, in all three cores. Cost if wrong: a helper file.
6. **The alternative cores call `workflow.events()` ONCE at construction and derive both `events$` and the reducer's state from that one Observable.** The RxJS core calls it twice (the use case and the raw `events$`), which is two port subscriptions for one fact; the siblings keep one call and two subscriptions of the captured Observable (async: `topicFromObservable(source, lifetime)` for `events$` and a `relay(source, …)` producer for the state topic; Effect: `mirrorPortAsIs(host, source, { retain: true })` and a retained `sharedFold` whose `run` calls `fromPort(source)`). Observable only through `portDiscipline`'s constancy, which holds either way. Cost if wrong: none.
7. **The three credit singletons are retained (`warmReplay`).** `rfqs.state$`/`events$`, `dealers.list$`, `instruments.list$` — `retainUntil: lifetime` (async) / `retain: true` (Effect), the slice-2 shape for `currencyPairs`. `rfqs$`, `allQuotes$` and `quotesForRfq$(id)` are refCounted derivations over the retained state, as the RxJS `shareReplay({ refCount: true })` over the warm `state$` is; a fresh subscriber replays the current roster synchronously because the retained source is warm. Cost if wrong: one option per stream.
8. **One-shot commands are `once`/`rpc` over the port method, per call.** `createRfq`, `acceptQuote`, `cancelRfq`, `passQuote`, `quoteRfq` (workflow) and `requestQuote` (pricing) are `promiseToStream(signal => once(port(...), signal))` in the async core and `streamToStream(host, Stream.fromEffect(Effect.suspend(() => rpc(port(...)))))` in the Effect core — the slice-2 `execution.execute` shape. Every workflow command in the simulator and the WS adapter emits `undefined` (or the id) and completes, so `once` never sees "completed without a value". Lazy: the port is called only when the result is subscribed (the harness witnesses through its pending queue). The result completes (slice 2 ruling 11). Cost if wrong: none.
9. **The submission machines take the presenter's commands as deps, and the presenter's `createSubmission()`/`createTicketSubmission()` build them** — `createRfqSubmissionMachine({ createRfq })`, `createTicketSubmissionMachine({ quoteRfq, passQuote })` — and `nativeMachines` wires `rfqSubmission: () => presenters.rfqs.createSubmission()` exactly as the RxJS `createMachineFactories` does. The machines are `Store`+`AbortController` / `SubscriptionRef`+detached-host (slice 2 ruling 8), never host-bound: `createMachineFactories(presenters)` has no app handle. Cost if wrong: a wiring line.
10. **A superseding `submit()`/`requestQuote()` cancels the run in flight** — the RxJS `switchMap`. Async: abort the previous controller before minting the next; Effect: `Fiber.interrupt` the previous run and guard every write on the run token (`tileExecution`'s shape). `rfqSubmission.submit` while `submitting` is therefore a second port call with the first withdrawn; the suite asserts the pending-queue transition, not a guard. `ticketSubmission` likewise (`switchMap` over `action$`). `rfqTile.requestQuote` is guarded to `init` and cannot supersede; its `cancel`/`accept`/`reject` end the run. Cost if wrong: a guard.
11. **The countdown is derived from the tick index, never from `Date.now()` mid-run** (the RxJS `timer(0, INTERVAL)` + `map(i => …)` idiom): `remaining = initial − tick × RFQ_COUNTDOWN_INTERVAL_MS`, clamped at 0, inclusive 0, then the run ends. `createRfqCountdownMachine` reads the clock ONCE at construction for `initial` (the async/Effect factories take `now: () => number = Date.now` for tests; the RxJS one reads `Date.now()` as today — vitest fakes `Date` under `useFakeTimers`, so the suite's `creationTimestamp = Date.now()` is exact in all three). Equal-value re-emission of the seed on the first tick is uncontracted (the RxJS `timer(0, …)` re-emits `initial`; a `Store` drops it). Cost if wrong: none observable.
12. **The `rfqTile` countdown emits `RFQ_TIMEOUT_MS / RFQ_COUNTDOWN_INTERVAL_MS` received states, then `rejected`, then `init` after `REJECTED_DISPLAY_MS`.** The suite pins the first two ticks, the terminal transitions at exact boundaries, and that every consecutive received pair differs by exactly one interval — it does not pin the full 100-element array (a 100-tick fixture is noise, and a late-joiner conflation would be a slice-2-recorded asymmetry, not a defect). `cancel` from `requested` withdraws the pending quote request (`takeUntil` unsubscribes the port; abort/interrupt release it in the siblings) — the suite asserts `pendingRfqQuotes()` is empty afterwards. Cost if wrong: a count.
13. **Dispose semantics stay as slice 2 recorded them:** `dispose()` ends the machine's keep-alive and every timer; what a still-attached subscriber hears afterwards is uncontracted; a fresh subscription afterwards yields the current value synchronously. The submission machine disposed before `RFQ_REDIRECT_DELAY_MS` never calls `onRedirect` (the RxJS `warm.unsubscribe()` tears the `timer` down) — that IS contracted, through the callback. Cost if wrong: none.
14. **The harness pending queue is one helper, used four times.** `createPendingQueue<Req, Res>()` replaces the inline execution queue of slice 2 and backs `workflow` commands, `pricing.getRfqQuote` and (unchanged in behaviour) `execution.executeTrade`: a request is pending from SUBSCRIBE until settled or unsubscribed, FIFO settle, no-op when empty. Three copies of the slice-2 code would be the finding a reviewer writes. Cost if wrong: the slice-2 `execution` suite is the regression witness.
15. **The Effect Layer graph grows by four `presenterLayer`s, no dependents.** None of the credit presenters depends on another native presenter (the RxJS `createApp` builds `rfqs` from `ports.workflow` alone, `rfqQuote` from `ports.pricing`); they join `independent` in `buildAppLayer`, `nativePresentersEffect` and `NativeServices`; `layers.test.ts`'s count goes 22 → 26. Cost if wrong: mechanical.
16. **PR A changes production behaviour in exactly one place:** the bindings' `useRfqCountdown` now goes through the seam. Under `VITE_CORE_IMPL` unset that resolves to the same `createRfqCountdownMachine` — `solid-bindings/src/createViewModel.machines.test.tsx`'s `useRfqCountdown` case (a real `createMachineFactories`) and the credit e2e leg are the witnesses. Everything else in PR A is a move or an addition.

## Parallelism (accelerated SDD)

PR A: Task 1 (`domain`, `core-api`, `client-core`, the two bindings, two `parity.json` lines) and Task 2 (`core-contract` harness) touch disjoint packages and run as two parallel implementers on one worktree, each committing by pathspec (`git commit -- packages/domain packages/core-api packages/client-core packages/react-bindings packages/solid-bindings packages/client-core-async/src/parity.json packages/client-core-effect/src/parity.json` / `-- packages/core-contract`). **Build serialisation:** Task 2's harness imports `RfqQuoteResult`, `CreateRfqRequest`, `QuoteRequest`, `Dealer`, `Instrument`, `RfqEvent` (all exist today) — it needs no Task 1 output to compile, but `pnpm --filter @rtc/core-contract build` rebuilds `domain` and `core-api` through project references; Task 2 runs its build only after Task 1 has committed, or runs `vitest` without building (its own tests resolve `#/` from `src`). Task 3 (suites + registry) follows both, alone. Ship PR A.
PR B: Task 4 (async core) and Task 5 (Effect core) touch disjoint packages and run as two parallel implementers on one fresh worktree off the merged `main`, committing by pathspec (`-- packages/client-core-async` / `-- packages/client-core-effect`); each builds only its own package with `--filter`, never concurrently with the other (agree an order in the ledger: Task 4 builds first, Task 5 after Task 4's report). Task 6 last, alone. Covering tests only per implementer; one gauntlet per PR (Task 3 Step 9 for PR A; Task 6 for PR B).

---

## File structure

```
PR A ───────────────────────────────────────────────────────────────────────────
packages/domain/                                    MODIFIED (Task 1)
  src/fx/trade.ts                                   + RFQ_COUNTDOWN_INTERVAL_MS
  src/credit/rfq.ts                                 + RFQ_REDIRECT_DELAY_MS
  src/usecases/WorkflowEventStreamUseCase.ts        emptyState → exported createEmptyRfqStreamState
  src/usecases/index.ts, src/index.ts               export the three
packages/core-api/                                  MODIFIED (Task 1)
  src/machine.ts                                    + MachineFactories.rfqCountdown
  src/__tests__/machine-factories.test.ts           eleven → twelve
packages/client-core/                               MODIFIED (Task 1)
  src/presenters/shallowArrayEquals.ts              NEW  shallowArrayEquals, createShallowArrayMemo
  src/presenters/__tests__/shallowArrayEquals.test.ts NEW
  src/presenters/RfqsPresenter.ts                   import shallowArrayEquals; REDIRECT_DELAY_MS aliases the domain constant
  src/presenters/RfqTileMachine.ts                  COUNTDOWN_INTERVAL_MS aliases the domain constant
  src/presenters/RfqCountdownMachine.ts             COUNTDOWN_INTERVAL_MS aliases the domain constant
  src/presenters/index.ts                           export shallowArrayEquals
  src/composition.ts                                createMachineFactories + rfqCountdown
  src/composition.machineFactories.test.ts          + rfqCountdown case
packages/react-bindings/src/createViewModel.ts      useRfqCountdown → machines.rfqCountdown
packages/solid-bindings/src/createViewModel.ts      useRfqCountdown → machines.rfqCountdown
packages/client-core-async/src/parity.json          + machines.rfqCountdown: delegated
packages/client-core-effect/src/parity.json         + machines.rfqCountdown: delegated
packages/core-contract/                             MODIFIED (Task 2)
  src/harness/pendingQueue.ts                       NEW  createPendingQueue
  src/harness/scriptedPorts.ts                      scripted workflow/dealers/instruments/getRfqQuote; execution over the queue; driver verbs; PortMethodName + 3
  src/harness/fixtures.ts                           + createRfq, createQuote, createDealer, createInstrument, createRfqQuoteResult
  src/harness/scriptedPorts.test.ts                 + credit port cases
  src/harness/pendingQueue.test.ts                  NEW
  src/index.ts                                      export the fixtures + WorkflowCommand/RfqQuoteRequest types
packages/core-contract/                             MODIFIED (Task 3)
  src/suites/{rfqs,dealers,instruments,rfqQuote}.ts NEW
  src/suites/{rfqTile,rfqSubmission,ticketSubmission,rfqCountdown}.ts   NEW
  src/suites/portDiscipline.ts                      + workflow.events, dealers.getDealers, instruments.getInstruments
  src/registry.ts                                   eight → suites (one new key); PENDING_SUITES −7
  src/registry.test.ts                              + "slice 3 members have suites"
PR B ───────────────────────────────────────────────────────────────────────────
packages/client-core-async/                         MODIFIED (Task 4)
  src/presenters/rfqs.ts                            NEW  createRfqsPresenter
  src/presenters/warmSingletons.ts                  + createDealersPresenter, createInstrumentsPresenter
  src/presenters/rfqQuote.ts                        NEW  createRfqQuotePresenter
  src/machines/{rfqTile,rfqSubmission,ticketSubmission,rfqCountdown}.ts   NEW
  src/composition.ts                                nativePresenters + 4; nativeMachines + 4
  src/composition.machineFactories.test.ts          + wiring cases
  src/parity.json / src/index.ts / README.md
  tests: presenters/{rfqs,rfqQuote,warmSingletons}.test.ts, machines/*.test.ts
packages/client-core-effect/                        MODIFIED (Task 5)
  src/presenters/rfqs.ts                            NEW  createRfqsPresenter
  src/presenters/warmSingletons.ts                  + createDealersPresenter, createInstrumentsPresenter
  src/presenters/rfqQuote.ts                        NEW  createRfqQuotePresenter
  src/machines/{rfqTile,rfqSubmission,ticketSubmission,rfqCountdown}.ts   NEW
  src/layers.ts                                     + RfqsTag, DealersTag, InstrumentsTag, RfqQuoteTag + Live layers
  src/composition.ts                                nativeMachines + 4
  src/layers.test.ts                                22 → 26
  src/composition.machineFactories.test.ts          + wiring cases
  src/parity.json / src/index.ts / README.md
  tests: presenters/{rfqs,rfqQuote,warmSingletons}.test.ts, machines/*.test.ts
docs (Task 6): ADR-006 "Decided in slice 3"; §22 "Credit: commands, folds and countdowns"; spec receipt; CLAUDE.md; STATUS.md; both READMEs
```

---

## PR A — the RxJS side

### Task 1: Seam, constants and helpers (domain, core-api, client-core, bindings)

**Files:**
- Modify: `packages/domain/src/fx/trade.ts` (after `REJECTED_DISPLAY_MS`)
- Modify: `packages/domain/src/credit/rfq.ts` (after `CREDIT_RFQ_EXPIRY_SECONDS`)
- Modify: `packages/domain/src/usecases/WorkflowEventStreamUseCase.ts`
- Modify: `packages/domain/src/usecases/index.ts`, `packages/domain/src/index.ts`
- Modify: `packages/core-api/src/machine.ts`, `packages/core-api/src/__tests__/machine-factories.test.ts`
- Create: `packages/client-core/src/presenters/shallowArrayEquals.ts`, `packages/client-core/src/presenters/__tests__/shallowArrayEquals.test.ts`
- Modify: `packages/client-core/src/presenters/RfqsPresenter.ts`, `RfqTileMachine.ts`, `RfqCountdownMachine.ts`, `packages/client-core/src/presenters/index.ts`, `packages/client-core/src/composition.ts`, `packages/client-core/src/composition.machineFactories.test.ts`
- Modify: `packages/react-bindings/src/createViewModel.ts:1321-1325`, `packages/solid-bindings/src/createViewModel.ts:1387-1391`
- Modify: `packages/client-core-async/src/parity.json`, `packages/client-core-effect/src/parity.json` (one line each)

**Interfaces:**
- Produces (domain): `RFQ_COUNTDOWN_INTERVAL_MS: 100`, `RFQ_REDIRECT_DELAY_MS: 1_500`, `createEmptyRfqStreamState(): RfqStreamState`.
- Produces (core-api): `MachineFactories.rfqCountdown: (creationTimestamp: number, totalMs: number) => ReadOnlyMachine<number>`.
- Produces (client-core): `shallowArrayEquals<T>(a: readonly T[], b: readonly T[]): boolean`; `createShallowArrayMemo<S, T>(project: (source: S) => readonly T[]): (source: S) => readonly T[]`.

- [ ] **Step 1: Domain constants and the exported seed**

In `packages/domain/src/fx/trade.ts`, directly after `REJECTED_DISPLAY_MS`:

```ts
/** How often an RFQ countdown ticks — the FX tile's received-quote countdown
 * and the credit RFQ card's live timer. Three application cores and the
 * contract tier read it, which is why it lives here and not in a presenter. */
export const RFQ_COUNTDOWN_INTERVAL_MS = 100;
```

In `packages/domain/src/credit/rfq.ts`, directly after `CREDIT_RFQ_EXPIRY_SECONDS`:

```ts
/** Delay between confirming a freshly-created RFQ and redirecting the user
 * back to the RFQ list (the `rfqSubmission` machine). A UI cadence, kept
 * here because three application cores and the contract tier read it. */
export const RFQ_REDIRECT_DELAY_MS = 1_500;
```

In `packages/domain/src/usecases/WorkflowEventStreamUseCase.ts`, replace the private `emptyState` with an export and use it in both places:

```ts
/** The reducer's seed — what the RFQ stream holds before the first event
 * and after `startOfStateOfTheWorld`. Exported because every application
 * core runs `reduceRfqEvent` from this same seed under its own runtime. */
export function createEmptyRfqStreamState(): RfqStreamState {
  return { rfqs: new Map(), quotes: new Map() };
}
```

(`reduceRfqEvent`'s `startOfStateOfTheWorld` arm returns `createEmptyRfqStreamState()`; `execute()` scans from `createEmptyRfqStreamState()`.)

Export: in `packages/domain/src/usecases/index.ts`, next to the existing `reduceRfqEvent` export add `createEmptyRfqStreamState`; in `packages/domain/src/index.ts` add `RFQ_COUNTDOWN_INTERVAL_MS` beside `RFQ_TIMEOUT_MS` (the `./fx/trade.js` block), `RFQ_REDIRECT_DELAY_MS` beside `CREDIT_QUANTITY_MULTIPLIER` (the `./credit/rfq.js` block), and `createEmptyRfqStreamState` beside `reduceRfqEvent` (the usecases block). Run `pnpm --filter @rtc/domain build && pnpm --filter @rtc/domain test`. Expected: green.

- [ ] **Step 2: `core-api` — the twelfth factory**

In `packages/core-api/src/machine.ts`, inside `MachineFactories`, after `ticketSubmission`:

```ts
  /** Live countdown for an open credit RFQ (the RFQ card's timer):
   * `remainingMs`, ticking every `RFQ_COUNTDOWN_INTERVAL_MS` from
   * `totalMs − (now − creationTimestamp)` down to an inclusive 0, then still.
   * Intent-free. One per card mount. */
  rfqCountdown: (
    creationTimestamp: number,
    totalMs: number,
  ) => ReadOnlyMachine<number>;
```

In `packages/core-api/src/__tests__/machine-factories.test.ts`, the case title becomes `"has exactly the twelve factory members"` and the union gains `| "rfqCountdown"` after `"ticketSubmission"`. Run `pnpm --filter @rtc/core-api build && pnpm --filter @rtc/core-api test`. Expected: green; `pnpm gates` grep gate 42 unaffected (a type only).

- [ ] **Step 3: Write the failing helper test (client-core)**

`packages/client-core/src/presenters/__tests__/shallowArrayEquals.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  createShallowArrayMemo,
  shallowArrayEquals,
} from "../shallowArrayEquals.js";

describe("shallowArrayEquals", () => {
  it("is true for the same reference, equal elements by reference, and false on length or element mismatch", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    const list = [a, b];
    expect(shallowArrayEquals(list, list)).toBe(true);
    expect(shallowArrayEquals([a, b], [a, b])).toBe(true);
    expect(shallowArrayEquals([a], [a, b])).toBe(false);
    expect(shallowArrayEquals([a, b], [a, { id: 2 }])).toBe(false);
  });
});

describe("createShallowArrayMemo", () => {
  it("hands back the PREVIOUS array when the projection is shallow-equal, and the new one otherwise", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    const project = createShallowArrayMemo((source: Map<number, object>) => {
      return Array.from(source.values());
    });
    const first = project(new Map([[1, a]]));
    const same = project(new Map([[1, a]]));
    expect(same).toBe(first);
    const grown = project(
      new Map([
        [1, a],
        [2, b],
      ]),
    );
    expect(grown).not.toBe(first);
    expect(grown).toEqual([a, b]);
    expect(project(new Map([[2, b]]))).toEqual([b]);
  });
});
```

Run: `pnpm --filter @rtc/client-core exec vitest run src/presenters/__tests__/shallowArrayEquals.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 4: The helper**

`packages/client-core/src/presenters/shallowArrayEquals.ts`:

```ts
/** Element-wise reference equality — what `rfqs$` and `quotesForRfq$` use
 * to suppress a re-emission after an event that left the roster unchanged
 * (`endOfStateOfTheWorld`, a quote event against `rfqs$`). Exported so both
 * alternative cores suppress the same emissions, not a look-alike. */
export function shallowArrayEquals<T>(
  a: readonly T[],
  b: readonly T[],
): boolean {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

/** `project`, returning the PREVIOUS result whenever the new one is
 * shallow-equal to it — so a downstream that de-duplicates by reference
 * (the async core's derived topic, the Effect core's `Object.is` fold
 * guard) drops exactly what `distinctUntilChanged(shallowArrayEquals)`
 * drops. One memo per derived stream; it holds one array. */
export function createShallowArrayMemo<S, T>(
  project: (source: S) => readonly T[],
): (source: S) => readonly T[] {
  let previous: readonly T[] | null = null;

  return (source: S) => {
    const next = project(source);

    if (previous !== null && shallowArrayEquals(previous, next)) {
      return previous;
    }

    previous = next;
    return next;
  };
}
```

Run the test again. Expected: PASS.

- [ ] **Step 5: Rewire the RxJS files to the shared code (behaviour unchanged)**

`packages/client-core/src/presenters/RfqsPresenter.ts`: delete the local `shallowArrayEquals` function; add `import { shallowArrayEquals } from "./shallowArrayEquals.js";`; replace `const REDIRECT_DELAY_MS = 1500;` (and its comment) with

```ts
import { RFQ_REDIRECT_DELAY_MS } from "@rtc/domain";   // in the existing @rtc/domain import list
/** Presenter-local alias of the domain cadence, so the machine reads as it
 * always has. */
const REDIRECT_DELAY_MS = RFQ_REDIRECT_DELAY_MS;
```

`packages/client-core/src/presenters/RfqTileMachine.ts` and `RfqCountdownMachine.ts`: replace `const COUNTDOWN_INTERVAL_MS = 100;` (and its comment) with `const COUNTDOWN_INTERVAL_MS = RFQ_COUNTDOWN_INTERVAL_MS;` and add `RFQ_COUNTDOWN_INTERVAL_MS` to each file's `@rtc/domain` import (`RfqCountdownMachine.ts` has no `@rtc/domain` import yet — add `import { RFQ_COUNTDOWN_INTERVAL_MS } from "@rtc/domain";`).

`packages/client-core/src/presenters/index.ts`: next to the `blotterFolds` export line add `export { createShallowArrayMemo, shallowArrayEquals } from "./shallowArrayEquals.js";`.

`packages/client-core/src/composition.ts`, `createMachineFactories`, after the `ticketSubmission` entry:

```ts
    rfqCountdown: (creationTimestamp: number, totalMs: number) => {
      return createRfqCountdownMachine(creationTimestamp, totalMs);
    },
```

(`createRfqCountdownMachine` is imported from `./presenters/RfqCountdownMachine.js` if not already; check the file's import block.)

`packages/client-core/src/composition.machineFactories.test.ts`: add, after the `rfqTile` case,

```ts
  it("rfqCountdown seeds from its two arguments — a 300 ms window created now starts at 300", () => {
    const factories = createMachineFactories(createStubPresenters().presenters);
    const machine = factories.rfqCountdown(Date.now(), 300);
    let seen: number | null = null;
    machine.state$
      .subscribe((value) => {
        seen = value;
      })
      .unsubscribe();
    expect(seen).toBe(300);
    machine.dispose();
  });
```

(Adapt the stub-presenter helper name to what the file already uses — read it first; if the file wraps in `vi.useFakeTimers`, keep that so the `timer(0, …)` never fires on real time.)

Run `pnpm --filter @rtc/client-core build && pnpm --filter @rtc/client-core test`. Expected: green — every existing `RfqsPresenter`/`RfqTileMachine`/`RfqCountdownMachine`/`RfqSubmissionMachine`/`TicketSubmissionMachine` test passes unchanged (the witness that behaviour did not move).

- [ ] **Step 6: The bindings go through the seam; the manifests list the member**

`packages/react-bindings/src/createViewModel.ts`: in `useRfqCountdown`, replace `createRfqCountdownMachine(creationTimestamp, totalMs)` with `machines.rfqCountdown(creationTimestamp, totalMs)`; remove `createRfqCountdownMachine` from the `@rtc/client-core` import list. Same two edits in `packages/solid-bindings/src/createViewModel.ts`. In both `packages/client-core-async/src/parity.json` and `packages/client-core-effect/src/parity.json`, under `"machines"`, after `"ticketSubmission": "delegated",` add `"rfqCountdown": "delegated",`.

Run: `pnpm --filter @rtc/react-bindings --filter @rtc/solid-bindings test` (the Solid `useRfqCountdown` case is the seam witness) and `pnpm --filter @rtc/core-contract build && pnpm --filter @rtc/client-core-async --filter @rtc/client-core-effect exec vitest run src/parity.test.ts` — wait for Task 2's implementer to have no build running first (see "Parallelism"). Expected: green. `pnpm typecheck` across `client-react`/`client-solid`: green (the UI-contract `viewModelFromWorld.ts` harnesses still import `createRfqCountdownMachine` directly and are untouched).

- [ ] **Step 7: Commit (by pathspec)**

```bash
git add packages/domain packages/core-api packages/client-core packages/react-bindings packages/solid-bindings packages/client-core-async/src/parity.json packages/client-core-effect/src/parity.json
git commit -m "feat(pluggable-core): slice 3 seam — rfqCountdown joins MachineFactories; RFQ cadences in domain; shallowArrayEquals exported" -- packages/domain packages/core-api packages/client-core packages/react-bindings packages/solid-bindings packages/client-core-async/src/parity.json packages/client-core-effect/src/parity.json
```

(With the trailer from Global Constraints.)

---

### Task 2: Harness — scripted credit ports and the pending queue

**Files:**
- Create: `packages/core-contract/src/harness/pendingQueue.ts`, `packages/core-contract/src/harness/pendingQueue.test.ts`
- Modify: `packages/core-contract/src/harness/scriptedPorts.ts`, `packages/core-contract/src/harness/scriptedPorts.test.ts`, `packages/core-contract/src/harness/fixtures.ts`, `packages/core-contract/src/index.ts`

**Interfaces:**
- Produces: `createPendingQueue<Req, Res>(): PendingQueue<Req, Res>` with `open(request): Observable<Res>`, `pending(): readonly Req[]`, `resolve(value: Res): void`, `fail(error: unknown): void`, `drain(): void`.
- Produces (driver): `emitRfqEvent(event: RfqEvent)`, `rfqEventsObserved(): boolean`, `emitDealers(list)`, `dealersObserved()`, `emitInstruments(list)`, `instrumentsObserved()`, `pendingRfqQuotes(): readonly RfqQuoteRequest[]`, `resolveRfqQuote(result: RfqQuoteResult)`, `failRfqQuote(error)`, `pendingWorkflowCommands(): readonly WorkflowCommand[]`, `resolveWorkflowCommand(rfqId?: number)`, `failWorkflowCommand(error)`.
- Produces (types): `RfqQuoteRequest { symbol: string; pipsPosition: number }`; `WorkflowCommand = { kind: "createRfq"; request: CreateRfqRequest } | { kind: "accept"; quoteId } | { kind: "cancelRfq"; rfqId } | { kind: "pass"; quoteId } | { kind: "quote"; request: QuoteRequest }`.
- Produces (`PortMethodName`): `"workflow.events" | "dealers.getDealers" | "instruments.getInstruments"`.
- Produces (fixtures): `createRfq(overrides?)`, `createQuote(overrides?)`, `createDealer(id, name?)`, `createInstrument(overrides?)`, `createRfqQuoteResult(mid)`.

- [ ] **Step 1: Write the failing pending-queue test**

`packages/core-contract/src/harness/pendingQueue.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createPendingQueue } from "#/harness/pendingQueue";

describe("createPendingQueue", () => {
  it("a request is pending from SUBSCRIBE (not from open) until resolved; resolve is FIFO and next+complete", () => {
    const queue = createPendingQueue<string, number>();
    const first = queue.open("a");
    const second = queue.open("b");
    expect(queue.pending()).toEqual([]);
    const seenA: number[] = [];
    const seenB: number[] = [];
    let completedA = false;
    first.subscribe({
      next: (value) => {
        seenA.push(value);
      },
      complete: () => {
        completedA = true;
      },
    });
    second.subscribe((value) => {
      seenB.push(value);
    });
    expect(queue.pending()).toEqual(["a", "b"]);
    queue.resolve(1);
    expect(seenA).toEqual([1]);
    expect(completedA).toBe(true);
    expect(seenB).toEqual([]);
    expect(queue.pending()).toEqual(["b"]);
  });

  it("unsubscribing withdraws the request; fail errors the oldest; both are no-ops when nothing is pending", () => {
    const queue = createPendingQueue<string, number>();
    const sub = queue.open("a").subscribe();
    expect(queue.pending()).toEqual(["a"]);
    sub.unsubscribe();
    expect(queue.pending()).toEqual([]);
    queue.resolve(1);
    queue.fail(new Error("nobody"));
    const errors: unknown[] = [];
    queue.open("b").subscribe({
      error: (error: unknown) => {
        errors.push(error);
      },
    });
    queue.fail(new Error("bust"));
    expect(errors).toHaveLength(1);
    expect(queue.pending()).toEqual([]);
  });

  it("drain completes every pending result and empties the queue", () => {
    const queue = createPendingQueue<string, number>();
    let completed = 0;
    queue.open("a").subscribe({
      complete: () => {
        completed += 1;
      },
    });
    queue.open("b").subscribe({
      complete: () => {
        completed += 1;
      },
    });
    queue.drain();
    expect(completed).toBe(2);
    expect(queue.pending()).toEqual([]);
  });
});
```

Run: `pnpm --filter @rtc/core-contract exec vitest run src/harness/pendingQueue.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 2: The pending queue**

`packages/core-contract/src/harness/pendingQueue.ts`:

```ts
import { Observable, Subject } from "rxjs";

/** One request the core has SUBSCRIBED and the driver has not yet settled. */
interface PendingRequest<Req, Res> {
  readonly request: Req;
  readonly result: Subject<Res>;
}

/** A scripted one-shot port method: `open(request)` is what the port
 * returns; the request becomes pending when the core SUBSCRIBES it (a
 * `defer`, so "lazy until subscribed" stays the core's property, witnessed
 * here), leaves the queue when it is settled or unsubscribed, and settles
 * FIFO. `resolve` is next + complete — every one-shot port in the repo
 * emits once and completes. A settle with nothing pending is a no-op. */
export interface PendingQueue<Req, Res> {
  open(request: Req): Observable<Res>;
  pending(): readonly Req[];
  resolve(value: Res): void;
  fail(error: unknown): void;
  /** Complete every pending result — teardown. */
  drain(): void;
}

export function createPendingQueue<Req, Res>(): PendingQueue<Req, Res> {
  const queue: PendingRequest<Req, Res>[] = [];

  function settleOldest(settle: (result: Subject<Res>) => void): void {
    const oldest = queue.shift();

    if (oldest !== undefined) {
      settle(oldest.result);
    }
  }

  return {
    open: (request: Req) => {
      return new Observable<Res>((subscriber) => {
        const entry: PendingRequest<Req, Res> = {
          request,
          result: new Subject<Res>(),
        };
        queue.push(entry);
        const inner = entry.result.subscribe(subscriber);

        return () => {
          inner.unsubscribe();
          const index = queue.indexOf(entry);

          if (index >= 0) {
            queue.splice(index, 1);
          }
        };
      });
    },
    pending: () => {
      return queue.map((entry) => {
        return entry.request;
      });
    },
    resolve: (value: Res) => {
      settleOldest((result) => {
        result.next(value);
        result.complete();
      });
    },
    fail: (error: unknown) => {
      settleOldest((result) => {
        result.error(error);
      });
    },
    drain: () => {
      for (const entry of queue.splice(0)) {
        entry.result.complete();
      }
    },
  };
}
```

Run the test. Expected: PASS.

- [ ] **Step 3: Fixtures**

Append to `packages/core-contract/src/harness/fixtures.ts` (extend the `@rtc/domain` import with `type Dealer`, `type Instrument`, `type Quote`, `type Rfq`, `RfqState`, `type RfqQuoteResult`):

```ts
/** An open credit RFQ created "now" (`creationTimestamp` 0 — pass one when
 * the countdown matters). */
export function createRfq(overrides: Partial<Rfq> = {}): Rfq {
  return {
    id: 1,
    instrumentId: 1,
    quantity: 1_000_000,
    direction: Direction.Buy,
    state: RfqState.Open,
    expirySecs: 120,
    creationTimestamp: 0,
    ...overrides,
  };
}

export function createQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 1,
    rfqId: 1,
    dealerId: 1,
    state: { type: "pendingWithoutPrice" },
    ...overrides,
  };
}

export function createDealer(id: number, name = `Dealer ${id}`): Dealer {
  return { id, name };
}

export function createInstrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
    id: 1,
    name: "Acme 5% 2030",
    cusip: "000000AA0",
    ticker: "ACME",
    maturity: "2030-01-01",
    interestRate: 5,
    benchmark: "UST 10Y",
    refPrice: 100,
    ...overrides,
  };
}

/** An FX RFQ quote around `mid` with a 1-pip spread. */
export function createRfqQuoteResult(mid: number): RfqQuoteResult {
  return { bid: mid - 0.00005, ask: mid + 0.00005, mid };
}
```

- [ ] **Step 4: Write the failing scripted-port tests**

Append to `packages/core-contract/src/harness/scriptedPorts.test.ts` (read its existing helper that builds a `base: AppPorts` — reuse it; the cases below call it `createBase()`):

```ts
  it("workflow.events() is the driver's Subject: emitRfqEvent reaches a subscriber, rfqEventsObserved reports it, the call is counted", () => {
    const { ports, driver, teardown } = scriptPorts(createBase());
    expect(driver.rfqEventsObserved()).toBe(false);
    const seen: RfqEvent[] = [];
    const sub = ports.workflow.events().subscribe((event) => {
      seen.push(event);
    });
    expect(driver.rfqEventsObserved()).toBe(true);
    expect(driver.portCalls("workflow.events")).toBe(1);
    driver.emitRfqEvent({ type: "startOfStateOfTheWorld" });
    expect(seen).toEqual([{ type: "startOfStateOfTheWorld" }]);
    sub.unsubscribe();
    teardown();
  });

  it("dealers.getDealers() and instruments.getInstruments() are Subjects with observed flags and counted calls", () => {
    const { ports, driver, teardown } = scriptPorts(createBase());
    const dealers: (readonly Dealer[])[] = [];
    const instruments: (readonly Instrument[])[] = [];
    const a = ports.dealers.getDealers().subscribe((list) => {
      dealers.push(list);
    });
    const b = ports.instruments.getInstruments().subscribe((list) => {
      instruments.push(list);
    });
    expect(driver.dealersObserved()).toBe(true);
    expect(driver.instrumentsObserved()).toBe(true);
    expect(driver.portCalls("dealers.getDealers")).toBe(1);
    expect(driver.portCalls("instruments.getInstruments")).toBe(1);
    const roster = [createDealer(1)];
    driver.emitDealers(roster);
    driver.emitInstruments([createInstrument()]);
    expect(dealers[0]).toBe(roster);
    expect(instruments).toHaveLength(1);
    a.unsubscribe();
    b.unsubscribe();
    teardown();
  });

  it("every workflow command is pending from subscribe, in one FIFO queue, and resolveWorkflowCommand settles the oldest", () => {
    const { ports, driver, teardown } = scriptPorts(createBase());
    const request: CreateRfqRequest = {
      instrumentId: 1,
      dealerIds: [1],
      quantity: 1_000_000,
      direction: Direction.Buy,
      expirySecs: 120,
    };
    const created = ports.workflow.createRfq(request);
    expect(driver.pendingWorkflowCommands()).toEqual([]);
    const ids: number[] = [];
    const createdSub = created.subscribe((id) => {
      ids.push(id);
    });
    const acceptSub = ports.workflow.accept(7).subscribe();
    ports.workflow.cancelRfq(3).subscribe();
    ports.workflow.pass(8).subscribe();
    ports.workflow.quote({ quoteId: 9, price: 101.5 }).subscribe();
    expect(driver.pendingWorkflowCommands()).toEqual([
      { kind: "createRfq", request },
      { kind: "accept", quoteId: 7 },
      { kind: "cancelRfq", rfqId: 3 },
      { kind: "pass", quoteId: 8 },
      { kind: "quote", request: { quoteId: 9, price: 101.5 } },
    ]);
    driver.resolveWorkflowCommand(42);
    expect(ids).toEqual([42]);
    acceptSub.unsubscribe();
    expect(driver.pendingWorkflowCommands().map((c) => c.kind)).toEqual([
      "cancelRfq",
      "pass",
      "quote",
    ]);
    driver.failWorkflowCommand(new Error("bust"));
    expect(driver.pendingWorkflowCommands()).toHaveLength(2);
    createdSub.unsubscribe();
    teardown();
  });

  it("pricing.getRfqQuote is pending from subscribe and resolves with the driver's result", () => {
    const { ports, driver, teardown } = scriptPorts(createBase());
    const quote = ports.pricing.getRfqQuote("EURUSD", 4);
    expect(driver.pendingRfqQuotes()).toEqual([]);
    const seen: RfqQuoteResult[] = [];
    quote.subscribe((result) => {
      seen.push(result);
    });
    expect(driver.pendingRfqQuotes()).toEqual([
      { symbol: "EURUSD", pipsPosition: 4 },
    ]);
    const result = createRfqQuoteResult(1.1);
    driver.resolveRfqQuote(result);
    expect(seen).toEqual([result]);
    expect(driver.pendingRfqQuotes()).toEqual([]);
    teardown();
  });

  it("the execution queue behaves as before: pending from subscribe, FIFO, withdrawn on unsubscribe", () => {
    const { ports, driver, teardown } = scriptPorts(createBase());
    const sub = ports.execution
      .executeTrade({
        currencyPair: "EURUSD",
        spotRate: 1.1,
        direction: Direction.Buy,
        notional: 1,
        dealtCurrency: "EUR",
      })
      .subscribe();
    expect(driver.pendingExecutions()).toHaveLength(1);
    sub.unsubscribe();
    expect(driver.pendingExecutions()).toEqual([]);
    teardown();
  });
```

(Imports to add: `type CreateRfqRequest`, `type Dealer`, `Direction`, `type Instrument`, `type RfqEvent`, `type RfqQuoteResult` from `@rtc/domain`; `createDealer`, `createInstrument`, `createRfqQuoteResult` from `#/harness/fixtures`.) Run: `pnpm --filter @rtc/core-contract exec vitest run src/harness/scriptedPorts.test.ts`. Expected: FAIL (`rfqEventsObserved is not a function`, …).

- [ ] **Step 5: Script the credit ports**

In `packages/core-contract/src/harness/scriptedPorts.ts`:

1. Imports: add `type CreateRfqRequest`, `type Dealer`, `type DealerPort`, `type Instrument`, `type InstrumentPort`, `type QuoteRequest`, `type RfqEvent`, `type RfqQuoteResult`, `type WorkflowPort` to the `@rtc/domain` import; add `import { createPendingQueue } from "#/harness/pendingQueue";`. Delete the local `PendingExecution` interface.
2. Extend `PortMethodName` with `| "workflow.events" | "dealers.getDealers" | "instruments.getInstruments"` and its doc ("… the three FX singletons and the three credit singletons every core calls once at construction").
3. Add the exported types:

```ts
/** What `pricing.getRfqQuote` was asked for. */
export interface RfqQuoteRequest {
  readonly symbol: string;
  readonly pipsPosition: number;
}

/** One workflow command the core has subscribed, by kind — the five
 * `WorkflowPort` methods share ONE FIFO so a suite reads the order the core
 * issued them in. */
export type WorkflowCommand =
  | { readonly kind: "createRfq"; readonly request: CreateRfqRequest }
  | { readonly kind: "accept"; readonly quoteId: number }
  | { readonly kind: "cancelRfq"; readonly rfqId: number }
  | { readonly kind: "pass"; readonly quoteId: number }
  | { readonly kind: "quote"; readonly request: QuoteRequest };
```

4. Extend `ScriptedDriver` with the twelve verbs (docs in the style of the existing ones):

```ts
  /** Push one raw RFQ event into `workflow.events()`. */
  emitRfqEvent(event: RfqEvent): void;
  rfqEventsObserved(): boolean;
  emitDealers(dealers: readonly Dealer[]): void;
  dealersObserved(): boolean;
  emitInstruments(instruments: readonly Instrument[]): void;
  instrumentsObserved(): boolean;
  /** Every `pricing.getRfqQuote` the core has subscribed and the driver has
   * not settled, oldest first. */
  pendingRfqQuotes(): readonly RfqQuoteRequest[];
  resolveRfqQuote(result: RfqQuoteResult): void;
  failRfqQuote(error: unknown): void;
  /** Every workflow command the core has subscribed and the driver has not
   * settled, oldest first, across all five methods. */
  pendingWorkflowCommands(): readonly WorkflowCommand[];
  /** Settle the OLDEST pending workflow command: `rfqId` is the value a
   * `createRfq` resolves with; the void commands ignore it. */
  resolveWorkflowCommand(rfqId?: number): void;
  failWorkflowCommand(error: unknown): void;
```

5. In `scriptPorts`: replace `const pending: PendingExecution[] = [];` and the `settlePending` helper with

```ts
  const executions = createPendingQueue<ExecutionRequest, Trade>();
  const rfqQuotes = createPendingQueue<RfqQuoteRequest, RfqQuoteResult>();
  const commands = createPendingQueue<WorkflowCommand, unknown>();
  const rfqEvents$ = new Subject<RfqEvent>();
  const dealers$ = new Subject<readonly Dealer[]>();
  const instruments$ = new Subject<readonly Instrument[]>();
```

   `execution.executeTrade` becomes `return executions.open(request);`; `pricing.getRfqQuote` becomes `return rfqQuotes.open({ symbol, pipsPosition });`. Add the three ports:

```ts
  const workflow: WorkflowPort = {
    events: (): Observable<RfqEvent> => {
      recordCall("workflow.events");
      return rfqEvents$;
    },
    createRfq: (request: CreateRfqRequest): Observable<number> => {
      return commands.open({ kind: "createRfq", request }) as Observable<number>;
    },
    cancelRfq: (rfqId: number): Observable<void> => {
      return commands.open({ kind: "cancelRfq", rfqId }) as Observable<void>;
    },
    quote: (request: QuoteRequest): Observable<void> => {
      return commands.open({ kind: "quote", request }) as Observable<void>;
    },
    pass: (quoteId: number): Observable<void> => {
      return commands.open({ kind: "pass", quoteId }) as Observable<void>;
    },
    accept: (quoteId: number): Observable<void> => {
      return commands.open({ kind: "accept", quoteId }) as Observable<void>;
    },
  };

  const dealers: DealerPort = {
    getDealers: (): Observable<readonly Dealer[]> => {
      recordCall("dealers.getDealers");
      return dealers$;
    },
  };

  const instruments: InstrumentPort = {
    getInstruments: (): Observable<readonly Instrument[]> => {
      recordCall("instruments.getInstruments");
      return instruments$;
    },
  };
```

   (The `as Observable<number>` / `as Observable<void>` casts narrow the one `unknown`-typed queue per method — the driver's `resolveWorkflowCommand(rfqId?)` is the only writer, and the suites only ever resolve a `createRfq` with a number. Keep the cast on the port side, never in a suite.)

   Spread `workflow`, `dealers`, `instruments` into the returned `ports`. Driver verbs:

```ts
      pendingExecutions: executions.pending,
      resolveExecution: executions.resolve,
      failExecution: executions.fail,
      emitRfqEvent: (event: RfqEvent) => {
        rfqEvents$.next(event);
      },
      rfqEventsObserved: () => {
        return rfqEvents$.observed;
      },
      emitDealers: (next: readonly Dealer[]) => {
        dealers$.next(next);
      },
      dealersObserved: () => {
        return dealers$.observed;
      },
      emitInstruments: (next: readonly Instrument[]) => {
        instruments$.next(next);
      },
      instrumentsObserved: () => {
        return instruments$.observed;
      },
      pendingRfqQuotes: rfqQuotes.pending,
      resolveRfqQuote: rfqQuotes.resolve,
      failRfqQuote: rfqQuotes.fail,
      pendingWorkflowCommands: commands.pending,
      resolveWorkflowCommand: (rfqId?: number) => {
        commands.resolve(rfqId);
      },
      failWorkflowCommand: commands.fail,
```

   `teardown`: replace the execution loop with `executions.drain(); rfqQuotes.drain(); commands.drain();` and complete `rfqEvents$`, `dealers$`, `instruments$`. Update the `scriptPorts` doc: "…the five FX ports and the three credit ports plus `pricing.getRfqQuote`…".

6. `packages/core-contract/src/index.ts`: export `createDealer`, `createInstrument`, `createQuote`, `createRfq`, `createRfqQuoteResult` from `#/harness/fixtures`; export `type RfqQuoteRequest`, `type WorkflowCommand` from `#/harness/scriptedPorts`; export `createPendingQueue`, `type PendingQueue` from `#/harness/pendingQueue`.

Run `pnpm --filter @rtc/core-contract test` (all harness tests incl. the slice-2 ones). Expected: green. Then, once Task 1's commit is in the tree and no other build is running, `pnpm --filter @rtc/core-contract build` — expected green with `check-dist: no zero-byte files…`.

- [ ] **Step 6: Commit (by pathspec)**

```bash
git add packages/core-contract
git commit -m "test(core-contract): scripted credit ports — workflow/dealers/instruments Subjects, one pending queue for every one-shot port" -- packages/core-contract
```

---

### Task 3: The eight suites, port discipline, registry — then ship PR A

**Files:**
- Create: `packages/core-contract/src/suites/{rfqs,dealers,instruments,rfqQuote,rfqTile,rfqSubmission,ticketSubmission,rfqCountdown}.ts`
- Modify: `packages/core-contract/src/suites/portDiscipline.ts`, `packages/core-contract/src/registry.ts`, `packages/core-contract/src/registry.test.ts`

**Interfaces:**
- Consumes: Task 1's constants (`RFQ_COUNTDOWN_INTERVAL_MS`, `RFQ_REDIRECT_DELAY_MS`, `RFQ_TIMEOUT_MS`, `REJECTED_DISPLAY_MS`, `RFQ_DEFAULT_EXPIRY_SECS`, `CREDIT_QUANTITY_MULTIPLIER`) and Task 2's driver verbs + fixtures.
- Produces: `describeRfqsContract`, `describeDealersContract`, `describeInstrumentsContract`, `describeRfqQuoteContract`, `describeRfqTileContract`, `describeRfqSubmissionContract`, `describeTicketSubmissionContract`, `describeRfqCountdownContract` — each `(label: string, makeHarness: MakeHarness) => void`.

Every suite follows the slice-2 shape: `describe(label, …)`, `const h = makeHarness()` inside each `it`, `try { … } finally { await h.teardown(); }`, machine cases under `withFakeClock` with `m.dispose()` then `h.teardown()` then `clock.settle()` in `finally`.

- [ ] **Step 1: `rfqs.ts`**

```ts
import { describe, expect, it } from "vitest";

import {
  CREDIT_QUANTITY_MULTIPLIER,
  Direction,
  RFQ_DEFAULT_EXPIRY_SECS,
  type RfqEvent,
  RfqState,
} from "@rtc/domain";

import { collect } from "#/harness/collect";
import { createQuote, createRfq } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const START: RfqEvent = { type: "startOfStateOfTheWorld" };
const END: RfqEvent = { type: "endOfStateOfTheWorld" };

export function describeRfqsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("rfqs$ is silent until the first event; start-of-world yields []; each created RFQ appends; end-of-world does not re-emit", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.rfqs.rfqs$);
        expect(c.values).toEqual([]);
        h.driver.emitRfqEvent(START);
        await settle();
        expect(c.values).toEqual([[]]);
        const one = createRfq({ id: 1 });
        const two = createRfq({ id: 2 });
        h.driver.emitRfqEvent({ type: "rfqCreated", payload: one });
        h.driver.emitRfqEvent({ type: "rfqCreated", payload: two });
        h.driver.emitRfqEvent(END);
        await settle();
        expect(c.values).toEqual([[], [one], [one, two]]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("rfqClosed replaces the RFQ with the same id in place; a quote event leaves rfqs$ silent", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.rfqs.rfqs$);
        const open = createRfq({ id: 1 });
        h.driver.emitRfqEvent(START);
        h.driver.emitRfqEvent({ type: "rfqCreated", payload: open });
        await settle();
        h.driver.emitRfqEvent({
          type: "quoteCreated",
          payload: createQuote({ id: 5, rfqId: 1 }),
        });
        await settle();
        expect(c.values).toHaveLength(2);
        const closed = createRfq({ id: 1, state: RfqState.Closed });
        h.driver.emitRfqEvent({ type: "rfqClosed", payload: closed });
        await settle();
        expect(c.values.at(-1)).toEqual([closed]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("allQuotes$ is the quote map keyed by quote id, re-emitted on quote events only; quotesForRfq$(id) filters it and is memoised per id", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqs;
        expect(p.quotesForRfq$(1)).toBe(p.quotesForRfq$(1));
        const all = collect(p.allQuotes$);
        const forOne = collect(p.quotesForRfq$(1));
        const forTwo = collect(p.quotesForRfq$(2));
        h.driver.emitRfqEvent(START);
        h.driver.emitRfqEvent({ type: "rfqCreated", payload: createRfq({ id: 1 }) });
        await settle();
        const quotesAfterRfq = all.values.length;
        const q1 = createQuote({ id: 10, rfqId: 1, dealerId: 1 });
        const q2 = createQuote({ id: 11, rfqId: 2, dealerId: 1 });
        h.driver.emitRfqEvent({ type: "quoteCreated", payload: q1 });
        h.driver.emitRfqEvent({ type: "quoteCreated", payload: q2 });
        await settle();
        expect(all.values.length).toBe(quotesAfterRfq + 2);
        expect(Array.from(all.values.at(-1)?.entries() ?? [])).toEqual([
          [10, q1],
          [11, q2],
        ]);
        expect(forOne.values.at(-1)).toEqual([q1]);
        expect(forTwo.values.at(-1)).toEqual([q2]);
        const quoted = createQuote({
          id: 10,
          rfqId: 1,
          dealerId: 1,
          state: { type: "pendingWithPrice", price: 101 },
        });
        h.driver.emitRfqEvent({ type: "quoteQuoted", payload: quoted });
        await settle();
        expect(forOne.values.at(-1)).toEqual([quoted]);
        expect(forTwo.values.at(-1)).toEqual([q2]);
        all.unsubscribe();
        forOne.unsubscribe();
        forTwo.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("events$ is the raw event stream, replay-current: a late joiner hears the last event", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqs;
        const c = collect(p.events$);
        h.driver.emitRfqEvent(START);
        const created: RfqEvent = { type: "rfqCreated", payload: createRfq() };
        h.driver.emitRfqEvent(created);
        await settle();
        expect(c.values).toEqual([START, created]);
        const late = collect(p.events$);
        expect(late.values).toEqual([created]);
        c.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("stays warm across zero subscribers: the port stays observed and a fresh rfqs$ subscriber replays the roster synchronously", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqs;
        const first = collect(p.rfqs$);
        const one = createRfq({ id: 1 });
        h.driver.emitRfqEvent(START);
        h.driver.emitRfqEvent({ type: "rfqCreated", payload: one });
        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.rfqEventsObserved()).toBe(true);
        const again = collect(p.rfqs$);
        expect(again.values).toEqual([[one]]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("createRfq is lazy and maps the UI input to the port request: quantity × CREDIT_QUANTITY_MULTIPLIER, expiry defaulted, dealer ids copied; the id lands as the result", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqs;
        const dealerIds = [1, 2];
        const created = p.createRfq({
          instrumentId: 7,
          dealerIds,
          quantity: 5,
          direction: Direction.Sell,
        });
        expect(h.driver.pendingWorkflowCommands()).toEqual([]);
        const c = collect(created);
        await settle();
        const pending = h.driver.pendingWorkflowCommands();
        expect(pending).toEqual([
          {
            kind: "createRfq",
            request: {
              instrumentId: 7,
              dealerIds: [1, 2],
              quantity: 5 * CREDIT_QUANTITY_MULTIPLIER,
              direction: Direction.Sell,
              expirySecs: RFQ_DEFAULT_EXPIRY_SECS,
            },
          },
        ]);
        h.driver.resolveWorkflowCommand(42);
        await settle();
        expect(c.values).toEqual([42]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("acceptQuote, cancelRfq, passQuote and quoteRfq each issue their command on subscribe and complete without error when settled; a failed command errors the result", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqs;
        const accept = collect(p.acceptQuote(7));
        const cancel = collect(p.cancelRfq(3));
        const pass = collect(p.passQuote(8));
        const quote = collect(p.quoteRfq({ quoteId: 9, price: 101.5 }));
        await settle();
        expect(h.driver.pendingWorkflowCommands()).toEqual([
          { kind: "accept", quoteId: 7 },
          { kind: "cancelRfq", rfqId: 3 },
          { kind: "pass", quoteId: 8 },
          { kind: "quote", request: { quoteId: 9, price: 101.5 } },
        ]);
        h.driver.resolveWorkflowCommand();
        h.driver.resolveWorkflowCommand();
        h.driver.resolveWorkflowCommand();
        h.driver.failWorkflowCommand(new Error("bust"));
        await settle();
        expect(accept.errors).toEqual([]);
        expect(cancel.errors).toEqual([]);
        expect(pass.errors).toEqual([]);
        expect(quote.errors).toHaveLength(1);
        expect(h.driver.pendingWorkflowCommands()).toEqual([]);
        accept.unsubscribe();
        cancel.unsubscribe();
        pass.unsubscribe();
        quote.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

- [ ] **Step 2: `dealers.ts` and `instruments.ts`** — the `currencyPairs` suite, renamed. `dealers.ts`:

```ts
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { createDealer } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeDealersContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("list$ has no value until the roster arrives, then delivers the roster itself", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.dealers.list$);
        expect(c.values).toEqual([]);
        const roster = [createDealer(1), createDealer(2)];
        h.driver.emitDealers(roster);
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
        const first = collect(h.app.presenters.dealers.list$);
        const roster = [createDealer(1)];
        h.driver.emitDealers(roster);
        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.dealersObserved()).toBe(true);
        const again = collect(h.app.presenters.dealers.list$);
        expect(again.values).toEqual([roster]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

`instruments.ts`: identical with `describeInstrumentsContract`, `presenters.instruments.list$`, `createInstrument({ id: 1 })`/`createInstrument({ id: 2 })`, `emitInstruments`, `instrumentsObserved`.

- [ ] **Step 3: `rfqQuote.ts`**

```ts
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { createRfqQuoteResult, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeRfqQuoteContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("requestQuote is lazy — the port sees the request only once subscribed — and the result lands", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqQuote;
        const quote = p.requestQuote(EURUSD.symbol, EURUSD.pipsPosition);
        expect(h.driver.pendingRfqQuotes()).toEqual([]);
        const c = collect(quote);
        await settle();
        expect(h.driver.pendingRfqQuotes()).toEqual([
          { symbol: "EURUSD", pipsPosition: EURUSD.pipsPosition },
        ]);
        const result = createRfqQuoteResult(1.1);
        h.driver.resolveRfqQuote(result);
        await settle();
        expect(c.values).toEqual([result]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("unsubscribing withdraws the request; a failing request errors the result", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqQuote;
        const withdrawn = collect(p.requestQuote("EURUSD", 4));
        await settle();
        withdrawn.unsubscribe();
        await settle();
        expect(h.driver.pendingRfqQuotes()).toEqual([]);
        const failing = collect(p.requestQuote("EURUSD", 4));
        await settle();
        h.driver.failRfqQuote(new Error("bust"));
        await settle();
        expect(failing.errors).toHaveLength(1);
        expect(failing.values).toEqual([]);
      } finally {
        await h.teardown();
      }
    });
  });
}
```

- [ ] **Step 4: `rfqTile.ts`** (fake clock)

```ts
import { describe, expect, it } from "vitest";

import type { RfqState } from "@rtc/core-api";
import {
  REJECTED_DISPLAY_MS,
  RFQ_COUNTDOWN_INTERVAL_MS,
  RFQ_TIMEOUT_MS,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createRfqQuoteResult, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };

function statuses(values: readonly RfqState[]): string[] {
  return values.map((state) => {
    return state.status;
  });
}

function receivedRemaining(values: readonly RfqState[]): number[] {
  return values
    .filter((state) => {
      return state.status === "received";
    })
    .map((state) => {
      return state.remainingMs;
    });
}

export function describeRfqTileContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts init; requestQuote() → requested with the pair's symbol and pips pending; a result → received with the quote and RFQ_TIMEOUT_MS remaining", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([INIT]);
          m.intents.requestQuote();
          await clock.settle();
          expect(statuses(c.values)).toEqual(["init", "requested"]);
          expect(h.driver.pendingRfqQuotes()).toEqual([
            { symbol: "EURUSD", pipsPosition: EURUSD.pipsPosition },
          ]);
          const result = createRfqQuoteResult(1.1);
          h.driver.resolveRfqQuote(result);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            status: "received",
            quote: { bid: result.bid, ask: result.ask, timeoutMs: RFQ_TIMEOUT_MS },
            remainingMs: RFQ_TIMEOUT_MS,
          });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("counts down one interval per RFQ_COUNTDOWN_INTERVAL_MS, auto-rejects at RFQ_TIMEOUT_MS, returns to init REJECTED_DISPLAY_MS later", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.requestQuote();
          await clock.settle();
          h.driver.resolveRfqQuote(createRfqQuoteResult(1.1));
          await clock.settle();
          await clock.advance(RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.settle();
          expect(c.values.at(-1)?.remainingMs).toBe(
            RFQ_TIMEOUT_MS - RFQ_COUNTDOWN_INTERVAL_MS,
          );
          await clock.advance(RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.settle();
          expect(c.values.at(-1)?.remainingMs).toBe(
            RFQ_TIMEOUT_MS - 2 * RFQ_COUNTDOWN_INTERVAL_MS,
          );
          await clock.advance(RFQ_TIMEOUT_MS - 2 * RFQ_COUNTDOWN_INTERVAL_MS - 1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("received");
          await clock.advance(1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("rejected");
          const ticks = receivedRemaining(c.values);
          expect(ticks[0]).toBe(RFQ_TIMEOUT_MS);
          expect(ticks.at(-1)).toBe(RFQ_COUNTDOWN_INTERVAL_MS);

          for (let i = 1; i < ticks.length; i += 1) {
            expect(ticks[i - 1] - (ticks[i] ?? 0)).toBe(RFQ_COUNTDOWN_INTERVAL_MS);
          }

          await clock.advance(REJECTED_DISPLAY_MS - 1);
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("rejected");
          await clock.advance(1);
          await clock.settle();
          expect(c.values.at(-1)).toEqual(INIT);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a failing quote request → rejected, then init after REJECTED_DISPLAY_MS", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.requestQuote();
          await clock.settle();
          h.driver.failRfqQuote(new Error("bust"));
          await clock.settle();
          expect(statuses(c.values)).toEqual(["init", "requested", "rejected"]);
          await clock.advance(REJECTED_DISPLAY_MS);
          await clock.settle();
          expect(statuses(c.values)).toEqual([
            "init",
            "requested",
            "rejected",
            "init",
          ]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("cancel() from requested withdraws the pending request and returns to init; accept() from received returns to init; reject() from received shows rejected then init", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.requestQuote();
          await clock.settle();
          m.intents.cancel();
          await clock.settle();
          expect(c.values.at(-1)).toEqual(INIT);
          expect(h.driver.pendingRfqQuotes()).toEqual([]);
          m.intents.requestQuote();
          await clock.settle();
          h.driver.resolveRfqQuote(createRfqQuoteResult(1.1));
          await clock.settle();
          m.intents.accept();
          await clock.settle();
          expect(c.values.at(-1)).toEqual(INIT);
          m.intents.requestQuote();
          await clock.settle();
          h.driver.resolveRfqQuote(createRfqQuoteResult(1.2));
          await clock.settle();
          m.intents.reject();
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("rejected");
          await clock.advance(REJECTED_DISPLAY_MS);
          await clock.settle();
          expect(c.values.at(-1)).toEqual(INIT);
          // The rejected hold ended the countdown: no received tick lands later.
          const ticksBefore = receivedRemaining(c.values).length;
          await clock.advance(RFQ_TIMEOUT_MS);
          await clock.settle();
          expect(receivedRemaining(c.values)).toHaveLength(ticksBefore);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("intents are no-ops outside their state: requestQuote() only from init, cancel() only from requested, accept()/reject() only from received", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.cancel();
          m.intents.accept();
          m.intents.reject();
          await clock.settle();
          expect(c.values).toEqual([INIT]);
          m.intents.requestQuote();
          await clock.settle();
          m.intents.requestQuote();
          m.intents.accept();
          m.intents.reject();
          await clock.settle();
          expect(statuses(c.values)).toEqual(["init", "requested"]);
          expect(h.driver.pendingRfqQuotes()).toHaveLength(1);
          h.driver.resolveRfqQuote(createRfqQuoteResult(1.1));
          await clock.settle();
          m.intents.cancel();
          m.intents.requestQuote();
          await clock.settle();
          expect(c.values.at(-1)?.status).toBe("received");
          expect(h.driver.pendingRfqQuotes()).toEqual([]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("dispose() ends the run and its timers; a fresh subscription afterwards yields the current value synchronously", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqTile(EURUSD);

        try {
          const c = collect(m.state$);
          m.intents.requestQuote();
          await clock.settle();
          c.unsubscribe();
          m.dispose();
          await clock.settle();
          expect(h.driver.pendingRfqQuotes()).toEqual([]);
          const fresh = collect(m.state$);
          expect(fresh.values).toHaveLength(1);
          fresh.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
```

(The last case asserts only that a fresh subscription yields ONE synchronous value: after `dispose()` the RxJS machine's `state$` may hold `requested` while a `Store`/`SubscriptionRef` holds whatever the abort left — slice 2 recorded post-dispose state as uncontracted. The pending-queue witness is the contracted part: dispose released the port call.)

- [ ] **Step 5: `rfqSubmission.ts`** (fake clock)

```ts
import { describe, expect, it, vi } from "vitest";

import type { RfqSubmissionState } from "@rtc/core-api";
import {
  CREDIT_QUANTITY_MULTIPLIER,
  type CreateRfqInput,
  Direction,
  RFQ_REDIRECT_DELAY_MS,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

const INPUT: CreateRfqInput = {
  instrumentId: 1,
  dealerIds: [1],
  quantity: 1,
  direction: Direction.Buy,
};

function statuses(values: readonly RfqSubmissionState[]): string[] {
  return values.map((state) => {
    return state.status;
  });
}

export function describeRfqSubmissionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts editing; submit() → submitting with one pending createRfq; the id → confirmed{rfqId}; onRedirect(rfqId) fires at exactly RFQ_REDIRECT_DELAY_MS and the machine returns to editing", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqSubmission();

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([{ status: "editing" }]);
          const onRedirect = vi.fn();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["editing", "submitting"]);
          expect(h.driver.pendingWorkflowCommands().map((command) => command.kind)).toEqual(["createRfq"]);
          h.driver.resolveWorkflowCommand(42);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({ status: "confirmed", rfqId: 42 });
          await clock.advance(RFQ_REDIRECT_DELAY_MS - 1);
          await clock.settle();
          expect(onRedirect).not.toHaveBeenCalled();
          await clock.advance(1);
          await clock.settle();
          expect(onRedirect).toHaveBeenCalledWith(42);
          expect(onRedirect).toHaveBeenCalledTimes(1);
          expect(c.values.at(-1)).toEqual({ status: "editing" });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a second round trip works after the redirect returned it to editing", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqSubmission();

        try {
          const c = collect(m.state$);
          const onRedirect = vi.fn();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          h.driver.resolveWorkflowCommand(1);
          await clock.settle();
          await clock.advance(RFQ_REDIRECT_DELAY_MS);
          await clock.settle();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          h.driver.resolveWorkflowCommand(2);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({ status: "confirmed", rfqId: 2 });
          await clock.advance(RFQ_REDIRECT_DELAY_MS);
          await clock.settle();
          expect(onRedirect.mock.calls).toEqual([[1], [2]]);
          expect(c.values.at(-1)).toEqual({ status: "editing" });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a failed create returns to editing with no confirmation and no redirect", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqSubmission();

        try {
          const c = collect(m.state$);
          const onRedirect = vi.fn();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          h.driver.failWorkflowCommand(new Error("bust"));
          await clock.settle();
          expect(c.values.at(-1)).toEqual({ status: "editing" });
          expect(statuses(c.values)).not.toContain("confirmed");
          await clock.advance(RFQ_REDIRECT_DELAY_MS);
          await clock.settle();
          expect(onRedirect).not.toHaveBeenCalled();
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a second submit() while one is in flight supersedes it: the first request is withdrawn, the second's id confirms", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqSubmission();

        try {
          const c = collect(m.state$);
          const onRedirect = vi.fn();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          m.intents.submit({ ...INPUT, quantity: 2 }, onRedirect);
          await clock.settle();
          const pending = h.driver.pendingWorkflowCommands();
          expect(pending).toHaveLength(1);
          expect(pending[0]?.kind === "createRfq" && pending[0].request.quantity).toBe(
            2 * CREDIT_QUANTITY_MULTIPLIER,
          );
          h.driver.resolveWorkflowCommand(9);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({ status: "confirmed", rfqId: 9 });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("dispose() before the redirect delay cancels the redirect: onRedirect never fires", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqSubmission();

        try {
          const c = collect(m.state$);
          const onRedirect = vi.fn();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          h.driver.resolveWorkflowCommand(5);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({ status: "confirmed", rfqId: 5 });
          c.unsubscribe();
          m.dispose();
          await clock.advance(RFQ_REDIRECT_DELAY_MS);
          await clock.settle();
          expect(onRedirect).not.toHaveBeenCalled();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
```

- [ ] **Step 6: `ticketSubmission.ts`**

```ts
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeTicketSubmissionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts not submitted; submitPrice(quoteId, price) issues a quote command; on success submitted flips true", async () => {
      const h = makeHarness();
      const m = h.machines.ticketSubmission();

      try {
        const c = collect(m.state$);
        expect(c.values).toEqual([{ submitted: false }]);
        m.intents.submitPrice(7, 101.5);
        await settle();
        expect(h.driver.pendingWorkflowCommands()).toEqual([
          { kind: "quote", request: { quoteId: 7, price: 101.5 } },
        ]);
        expect(c.values.at(-1)).toEqual({ submitted: false });
        h.driver.resolveWorkflowCommand();
        await settle();
        expect(c.values.at(-1)).toEqual({ submitted: true });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("pass(quoteId) issues a pass command and flips submitted on success", async () => {
      const h = makeHarness();
      const m = h.machines.ticketSubmission();

      try {
        const c = collect(m.state$);
        m.intents.pass(8);
        await settle();
        expect(h.driver.pendingWorkflowCommands()).toEqual([
          { kind: "pass", quoteId: 8 },
        ]);
        h.driver.resolveWorkflowCommand();
        await settle();
        expect(c.values.at(-1)).toEqual({ submitted: true });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a failed command leaves submitted false (retryable): no true is ever emitted, and a retry can still succeed", async () => {
      const h = makeHarness();
      const m = h.machines.ticketSubmission();

      try {
        const c = collect(m.state$);
        m.intents.submitPrice(7, 101.5);
        await settle();
        h.driver.failWorkflowCommand(new Error("bust"));
        await settle();
        expect(
          c.values.every((state) => {
            return !state.submitted;
          }),
        ).toBe(true);
        m.intents.submitPrice(7, 102);
        await settle();
        h.driver.resolveWorkflowCommand();
        await settle();
        expect(c.values.at(-1)).toEqual({ submitted: true });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("dispose() releases an in-flight command; a fresh subscription afterwards yields the current value synchronously", async () => {
      const h = makeHarness();
      const m = h.machines.ticketSubmission();

      try {
        const c = collect(m.state$);
        m.intents.pass(8);
        await settle();
        c.unsubscribe();
        m.dispose();
        await settle();
        expect(h.driver.pendingWorkflowCommands()).toEqual([]);
        const fresh = collect(m.state$);
        expect(fresh.values).toEqual([{ submitted: false }]);
        fresh.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

- [ ] **Step 7: `rfqCountdown.ts`** (fake clock)

```ts
import { describe, expect, it } from "vitest";

import { RFQ_COUNTDOWN_INTERVAL_MS } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

const TOTAL_MS = 3 * RFQ_COUNTDOWN_INTERVAL_MS;

export function describeRfqCountdownContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts at totalMs − elapsed synchronously and ticks down one interval per RFQ_COUNTDOWN_INTERVAL_MS", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqCountdown(Date.now(), TOTAL_MS);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([TOTAL_MS]);
          await clock.advance(RFQ_COUNTDOWN_INTERVAL_MS - 1);
          await clock.settle();
          expect(c.values.at(-1)).toBe(TOTAL_MS);
          await clock.advance(1);
          await clock.settle();
          expect(c.values.at(-1)).toBe(TOTAL_MS - RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.advance(RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.settle();
          expect(c.values.at(-1)).toBe(TOTAL_MS - 2 * RFQ_COUNTDOWN_INTERVAL_MS);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("an RFQ created earlier starts lower; the countdown clamps at an inclusive 0 and then stays still", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqCountdown(
          Date.now() - RFQ_COUNTDOWN_INTERVAL_MS,
          TOTAL_MS,
        );

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([TOTAL_MS - RFQ_COUNTDOWN_INTERVAL_MS]);
          await clock.advance(2 * RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.settle();
          expect(c.values.at(-1)).toBe(0);
          const count = c.values.length;
          await clock.advance(2 * RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.settle();
          expect(c.values).toHaveLength(count);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("an already-expired RFQ starts at 0; dispose() stops the ticks and a fresh subscription yields the current value synchronously", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const expired = h.machines.rfqCountdown(Date.now() - 2 * TOTAL_MS, TOTAL_MS);
        const live = h.machines.rfqCountdown(Date.now(), TOTAL_MS);

        try {
          expect(collect(expired.state$).values).toEqual([0]);
          const c = collect(live.state$);
          c.unsubscribe();
          live.dispose();
          await clock.advance(TOTAL_MS);
          await clock.settle();
          const fresh = collect(live.state$);
          expect(fresh.values).toEqual([TOTAL_MS]);
          fresh.unsubscribe();
        } finally {
          expired.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
```

- [ ] **Step 8: Port discipline, registry, drift test**

`packages/core-contract/src/suites/portDiscipline.ts`: three cases in the exact shape of the `currencyPairs` one — `"rfqs: two warm periods of rfqs$ and of events$ do not call workflow.events() again"` (subscribe/unsubscribe `p.rfqs$`, then `p.events$`, each with `settle()` between), `"dealers: subscribe, unsubscribe, subscribe again does not call dealers.getDealers() again"` (`p.list$`), `"instruments: … instruments.getInstruments() …"`.

`packages/core-contract/src/registry.ts`: import the eight `describe*Contract`s; set `"presenters.rfqs"`, `"presenters.instruments"`, `"presenters.dealers"`, `"presenters.rfqQuote"`, `"machines.rfqTile"`, `"machines.rfqSubmission"`, `"machines.ticketSubmission"` to their suites; add `"machines.rfqCountdown": describeRfqCountdownContract` after `"machines.ticketSubmission"` (the `Record<ContractMember, …>` type made this a compile error until now — that is the seam gate working); remove the eight from `PENDING_SUITES` (it goes 45 → 37 — ruling R1 has Task 1 list `"machines.rfqCountdown"` as pending the moment the member exists, so the slice's own new key is removed here too).

`packages/core-contract/src/registry.test.ts`: add

```ts
  it("slice 3 members have suites", () => {
    for (const member of [
      "presenters.rfqs",
      "presenters.dealers",
      "presenters.instruments",
      "presenters.rfqQuote",
      "machines.rfqTile",
      "machines.rfqSubmission",
      "machines.ticketSubmission",
      "machines.rfqCountdown",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }
  });
```

Run `pnpm --filter @rtc/core-contract build && pnpm --filter @rtc/core-contract test` — green. Then the three runners: `pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts`, then the same for `@rtc/client-core-async` (`src/coreContract.test.ts`) and `@rtc/client-core-effect`. Expected: green on all three — RxJS meaningfully, the siblings trivially (delegated members ARE the RxJS instances). A red case on RxJS is a suite defect or a real envelope finding: rule on it in the ledger (the slice-2 pattern), never loosen silently.

- [ ] **Step 9: The local CI mirror, then ship PR A**

`/rtc:gauntlet full` (typecheck, tests, the four coverage gates, ESLint, the lint-warnings ledger, build, `check:scripts`, `check:dist`). Fix what is red on the branch. Commit:

```bash
git add packages/core-contract
git commit -m "test(core-contract): slice 3 suites — rfqs, dealers, instruments, rfqQuote, rfqTile, rfqSubmission, ticketSubmission, rfqCountdown; port discipline +3; PENDING_SUITES 45→37" -- packages/core-contract
```

Push, open PR A ("test(pluggable-core): slice 3 PR A — credit suites + scripted credit ports; rfqCountdown joins the seam"), loop CI on `headSha`, check CodeQL, merge `--merge`, confirm `merge-base --is-ancestor`, remove the worktree and branch. Record the SDD rulings ledger beside this plan as `2026-09-20-pluggable-core-slice-3-rulings.md` in PR B's worktree (feedback rule: commit rulings before removing the worktree — copy the ledger out before cleanup).

---

## PR B — the ports

### Task 4: The async core

**Files:**
- Create: `packages/client-core-async/src/presenters/rfqs.ts`, `rfqQuote.ts`; `src/machines/{rfqTile,rfqSubmission,ticketSubmission,rfqCountdown}.ts`; tests beside each (`*.test.ts`)
- Modify: `src/presenters/warmSingletons.ts` (+ two), `src/composition.ts`, `src/composition.machineFactories.test.ts`, `src/parity.json`, `src/index.ts`, `README.md`

**Interfaces:**
- Consumes: `createEmptyRfqStreamState`, `reduceRfqEvent`, `CreateRfqUseCase`, `RFQ_*` constants (`@rtc/domain`); `createShallowArrayMemo` (`@rtc/client-core`); kernel `createTopic`, `createStore`, `sleep`, `spawn`, `relayTopic`, `AbortError`, `reportAsync`; bridge `once`, `relay`, `topicFromObservable`, `topicToStream`, `promiseToStream`, `storeToStateStream`.
- Produces: `createRfqsPresenter(workflow: WorkflowPort, lifetime: AbortSignal): RfqsPresenter`; `createDealersPresenter(dealers, lifetime)`; `createInstrumentsPresenter(instruments, lifetime)`; `createRfqQuotePresenter(pricing): RfqQuotePresenter`; `createRfqTileMachine(pair, deps: RfqTileDeps)`; `createRfqSubmissionMachine(deps: RfqSubmissionDeps)`; `createTicketSubmissionMachine(deps: TicketSubmissionDeps)`; `createRfqCountdownMachine(creationTimestamp, totalMs, now?)`.

- [ ] **Step 1: Write the failing presenter tests**

`packages/client-core-async/src/presenters/rfqs.test.ts` — drive a `Subject<RfqEvent>`-backed `WorkflowPort` (a small `createWorkflowPort()` factory below the cases, every command method returning `of(undefined)` / `of(42)` and recording its arguments), and assert:

- `rfqs$` sequence `[[], [one], [one, two]]` after start, two creates and end (the shallow-equal suppression), values after the first via `await Promise.resolve()` twice (the async core delivers synchronously through `relay`, so no macrotask is needed — measure once and keep whatever the first green run used, stated in the test);
- `allQuotes$` does not re-emit on an RFQ event; `quotesForRfq$(1) === quotesForRfq$(1)`;
- `events$` replays the last event to a late joiner;
- **port release:** `workflow.events` was called ONCE (a counting stub) and the Subject is `observed` after the first subscriber, still observed after every subscriber left (retained), and NOT observed after `lifetime.abort()`;
- `createRfq` maps the input (quantity × 1 000, expiry default) and the returned stream completes after its one value;
- `createSubmission()` and `createTicketSubmission()` return machines whose `state$` yields `{ status: "editing" }` / `{ submitted: false }` synchronously (their behaviour lives in the machine tests).

`packages/client-core-async/src/presenters/rfqQuote.test.ts`: `requestQuote` is lazy (a `defer`-counting stub: 0 calls before subscribe, 1 after), emits the result and completes, unsubscribing before the result unsubscribes the source.

`packages/client-core-async/src/presenters/warmSingletons.test.ts`: extend the existing file with two cases mirroring the `currencyPairs` one for `createDealersPresenter`/`createInstrumentsPresenter` (port called once; observed across zero subscribers; released on abort).

Run them. Expected: FAIL (modules not found).

- [ ] **Step 2: The presenters**

`packages/client-core-async/src/presenters/rfqs.ts`:

```ts
import { createShallowArrayMemo } from "@rtc/client-core";
import type {
  Machine,
  RfqSubmissionIntents,
  RfqSubmissionState,
  RfqsPresenter,
  Stream,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "@rtc/core-api";
import {
  type CreateRfqInput,
  CreateRfqUseCase,
  createEmptyRfqStreamState,
  type Quote,
  type QuoteRequest,
  reduceRfqEvent,
  type Rfq,
  type RfqEvent,
  type RfqStreamState,
  type WorkflowPort,
} from "@rtc/domain";

import { once, relay, topicFromObservable } from "#/bridge/in";
import { promiseToStream, topicToStream } from "#/bridge/out";
import { relayTopic } from "#/kernel/relayTopic";
import { createTopic, type Topic } from "#/kernel/topic";
import { createRfqSubmissionMachine } from "#/machines/rfqSubmission";
import { createTicketSubmissionMachine } from "#/machines/ticketSubmission";

/** The last projected value, boxed so `null` reads as "nothing yet". */
interface Held<U> {
  readonly value: U;
}

/** A refCounted, replay-1 derivation of a topic that publishes only when
 * the projection's RESULT changes by reference — `map` +
 * `distinctUntilChanged` by reference. Paired with `createShallowArrayMemo`
 * it is `distinctUntilChanged(shallowArrayEquals)`, the RxJS core's
 * suppression for `rfqs$`/`quotesForRfq$`; paired with a field read it is
 * the reference check `allQuotes$` makes. */
function deriveDistinct<T, U>(
  source: Topic<T>,
  project: (value: T) => U,
): Topic<U> {
  return createTopic<U>(
    (signal, publish) => {
      let last: Held<U> | null = null;
      return relayTopic(source, signal, (value) => {
        const next = project(value);

        if (last !== null && Object.is(last.value, next)) {
          return;
        }

        last = { value: next };
        publish(next);
      });
    },
    { replay: true },
  );
}

/** The RFQ workflow: `workflow.events()` is called ONCE, here (ruling 6);
 * `events$` mirrors it retained, and `state` folds it with the domain
 * reducer from the domain seed — retained too, so a fresh `rfqs$`
 * subscriber replays the roster synchronously after every consumer left
 * (the RxJS `warmReplay()` over `state$`). `rfqs$`, `allQuotes$` and the
 * per-id `quotesForRfq$` are refCounted derivations that suppress
 * shallow-equal rosters (ruling 5). The five commands are `once` over the
 * port method, lazily, per call. */
export function createRfqsPresenter(
  workflow: WorkflowPort,
  lifetime: AbortSignal,
): RfqsPresenter {
  const source = workflow.events();
  const createUseCase = new CreateRfqUseCase(workflow);
  const events = topicFromObservable(source, lifetime);
  const state = createTopic<RfqStreamState>(
    (signal, publish) => {
      let current = createEmptyRfqStreamState();
      return relay(source, signal, (event: RfqEvent) => {
        current = reduceRfqEvent(current, event);
        publish(current);
      });
    },
    { replay: true, retainUntil: lifetime },
  );
  const rfqs = deriveDistinct(
    state,
    createShallowArrayMemo((s: RfqStreamState): readonly Rfq[] => {
      return Array.from(s.rfqs.values());
    }),
  );
  const allQuotes = deriveDistinct(state, (s: RfqStreamState) => {
    return s.quotes;
  });
  const quotesByRfq = new Map<number, Stream<readonly Quote[]>>();

  function createRfq(input: CreateRfqInput): Stream<number> {
    return promiseToStream((signal) => {
      return once(createUseCase.execute(input), signal);
    });
  }

  function quoteRfq(request: QuoteRequest): Stream<void> {
    return promiseToStream((signal) => {
      return once(workflow.quote(request), signal);
    });
  }

  function passQuote(quoteId: number): Stream<void> {
    return promiseToStream((signal) => {
      return once(workflow.pass(quoteId), signal);
    });
  }

  return {
    rfqs$: topicToStream(rfqs),
    allQuotes$: topicToStream(allQuotes),
    events$: topicToStream(events),
    quotesForRfq$: (rfqId: number) => {
      const cached = quotesByRfq.get(rfqId);

      if (cached !== undefined) {
        return cached;
      }

      const stream = topicToStream(
        deriveDistinct(
          state,
          createShallowArrayMemo((s: RfqStreamState): readonly Quote[] => {
            return Array.from(s.quotes.values()).filter((quote) => {
              return quote.rfqId === rfqId;
            });
          }),
        ),
      );
      quotesByRfq.set(rfqId, stream);
      return stream;
    },
    createRfq,
    acceptQuote: (quoteId: number) => {
      return promiseToStream((signal) => {
        return once(workflow.accept(quoteId), signal);
      });
    },
    cancelRfq: (rfqId: number) => {
      return promiseToStream((signal) => {
        return once(workflow.cancelRfq(rfqId), signal);
      });
    },
    passQuote,
    quoteRfq,
    createSubmission: (): Machine<RfqSubmissionState, RfqSubmissionIntents> => {
      return createRfqSubmissionMachine({ createRfq });
    },
    createTicketSubmission: (): Machine<
      TicketSubmissionState,
      TicketSubmissionIntents
    > => {
      return createTicketSubmissionMachine({ quoteRfq, passQuote });
    },
  };
}
```

(`relay` is a `bridge/in` export already used by `topicFromObservable`; using it in a presenter is allowed — the rule confines rxjs VALUE imports, not bridge helpers.)

`packages/client-core-async/src/presenters/warmSingletons.ts` — append:

```ts
/** The credit dealer roster — the same retained-singleton shape. */
export function createDealersPresenter(
  dealers: DealerPort,
  lifetime: AbortSignal,
): DealersPresenter {
  const source = new DealersUseCase(dealers).execute();

  return { list$: topicToStream(topicFromObservable(source, lifetime)) };
}

/** The credit instrument roster — the same retained-singleton shape. */
export function createInstrumentsPresenter(
  instruments: InstrumentPort,
  lifetime: AbortSignal,
): InstrumentsPresenter {
  const source = new InstrumentsUseCase(instruments).execute();

  return { list$: topicToStream(topicFromObservable(source, lifetime)) };
}
```

`packages/client-core-async/src/presenters/rfqQuote.ts`:

```ts
import type { RfqQuotePresenter } from "@rtc/core-api";
import { type PricingPort, RfqQuoteUseCase } from "@rtc/domain";

import { once } from "#/bridge/in";
import { promiseToStream } from "#/bridge/out";

/** One-shot FX RFQ quote: the port is called only when the returned stream
 * is subscribed; the result is emitted and the stream completes;
 * unsubscribing releases the in-flight call (`once`'s signal). */
export function createRfqQuotePresenter(pricing: PricingPort): RfqQuotePresenter {
  const useCase = new RfqQuoteUseCase(pricing);

  return {
    requestQuote: (symbol: string, pipsPosition: number) => {
      return promiseToStream((signal) => {
        return once(useCase.execute(symbol, pipsPosition), signal);
      });
    },
  };
}
```

- [ ] **Step 3: Write the failing machine tests**

One file per machine, `vi.useFakeTimers()` in `beforeEach`, the `rowHighlight.test.ts` shape. Cases (each a covering test, not the whole contract — the contract runner covers the rest):

- `rfqTile.test.ts`: `requestQuote` → requested and the injected `requestQuote` dep called with `(symbol, pipsPosition)` once; a resolved quote → received at `RFQ_TIMEOUT_MS`, then `RFQ_TIMEOUT_MS − 100` after 100 ms; `cancel()` from requested aborts the dep's subscription (a `defer`-wrapped `Subject` whose `observed` flips false) and lands `init`; `dispose()` mid-countdown stops the ticks (`values.length` frozen after a further advance).
- `rfqSubmission.test.ts`: editing → submitting → confirmed → `onRedirect` at exactly `RFQ_REDIRECT_DELAY_MS` → editing; a rejecting `createRfq` dep → editing, no redirect; `dispose()` before the delay → no redirect.
- `ticketSubmission.test.ts`: `submitPrice` calls `quoteRfq` with `{ quoteId, price }` and flips `submitted` on completion; `pass` calls `passQuote(quoteId)`; a rejecting dep keeps `submitted: false`.
- `rfqCountdown.test.ts`: `[300]` sync with `now` injected; `200` at 100 ms; `0` inclusive at 300 ms then frozen; `now − creationTimestamp > totalMs` → `[0]` and no timer (advance 1 s, still one value).

Run them. Expected: FAIL (modules not found).

- [ ] **Step 4: The machines**

`packages/client-core-async/src/machines/rfqTile.ts`:

```ts
import type {
  Machine,
  RfqQuote,
  RfqState,
  RfqTileIntents,
  Stream,
} from "@rtc/core-api";
import {
  type CurrencyPair,
  REJECTED_DISPLAY_MS,
  RFQ_COUNTDOWN_INTERVAL_MS,
  RFQ_TIMEOUT_MS,
  type RfqQuoteResult,
} from "@rtc/domain";

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

export interface RfqTileDeps {
  /** The request-quote command (`RfqQuotePresenter.requestQuote`), injected
   * so timing is controllable in tests. */
  requestQuote: (symbol: string, pipsPosition: number) => Stream<RfqQuoteResult>;
}

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };
const REQUESTED: RfqState = { status: "requested", quote: null, remainingMs: 0 };
const REJECTED: RfqState = { status: "rejected", quote: null, remainingMs: 0 };

/** The RxJS machine's one-run-per-request shape on a `Store`: `requested`,
 * then either a received countdown derived from the tick index (never the
 * clock) that falls through to the rejected hold at zero, or the rejected
 * hold at once when the request fails. `cancel`/`accept` abort the run and
 * reset; `reject` aborts it and runs the hold alone; each intent is guarded
 * to the state it is valid in, as the RxJS intents are. Abort releases the
 * in-flight port call through `once`'s signal. */
export function createRfqTileMachine(
  pair: CurrencyPair,
  deps: RfqTileDeps,
): Machine<RfqState, RfqTileIntents> {
  const store = createStore<RfqState>(INIT);
  let active: AbortController | null = null;
  let disposed = false;

  function endActive(): void {
    active?.abort();
    active = null;
  }

  function start(run: (signal: AbortSignal) => Promise<void>): void {
    endActive();
    const controller = new AbortController();
    active = controller;
    void spawn(() => {
      return run(controller.signal);
    }, reportAsync);
  }

  async function holdRejected(signal: AbortSignal): Promise<void> {
    store.set(REJECTED);
    await sleep(REJECTED_DISPLAY_MS, signal);
    store.set(INIT);
  }

  async function runQuote(signal: AbortSignal): Promise<void> {
    store.set(REQUESTED);
    let quote: RfqQuote | null = null;

    try {
      const result = await once(
        deps.requestQuote(pair.symbol, pair.pipsPosition),
        signal,
      );
      quote = { bid: result.bid, ask: result.ask, timeoutMs: RFQ_TIMEOUT_MS };
    } catch (error) {
      if (error instanceof AbortError) {
        throw error;
      }
    }

    if (quote !== null) {
      for (
        let remainingMs = RFQ_TIMEOUT_MS;
        remainingMs > 0;
        remainingMs -= RFQ_COUNTDOWN_INTERVAL_MS
      ) {
        store.set({ status: "received", quote, remainingMs });
        await sleep(RFQ_COUNTDOWN_INTERVAL_MS, signal);
      }
    }

    await holdRejected(signal);
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      requestQuote: () => {
        if (!disposed && store.get().status === "init") {
          start(runQuote);
        }
      },
      cancel: () => {
        if (!disposed && store.get().status === "requested") {
          endActive();
          store.set(INIT);
        }
      },
      accept: () => {
        if (!disposed && store.get().status === "received") {
          endActive();
          store.set(INIT);
        }
      },
      reject: () => {
        if (!disposed && store.get().status === "received") {
          start(holdRejected);
        }
      },
    },
    dispose: () => {
      disposed = true;
      endActive();
    },
  };
}
```

`packages/client-core-async/src/machines/rfqSubmission.ts`:

```ts
import type {
  Machine,
  RfqSubmissionIntents,
  RfqSubmissionState,
  Stream,
} from "@rtc/core-api";
import { type CreateRfqInput, RFQ_REDIRECT_DELAY_MS } from "@rtc/domain";

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

export interface RfqSubmissionDeps {
  /** The create-RFQ command (`RfqsPresenter.createRfq`). */
  createRfq: (input: CreateRfqInput) => Stream<number>;
}

const EDITING: RfqSubmissionState = { status: "editing" };
const SUBMITTING: RfqSubmissionState = { status: "submitting" };

/** editing → submitting → confirmed{rfqId} → (RFQ_REDIRECT_DELAY_MS)
 * onRedirect(rfqId) → editing; a failed create returns to editing. A new
 * `submit()` aborts the run in flight (the RxJS `switchMap`), which
 * withdraws its port call; `dispose()` aborts it too, so a pending redirect
 * never fires. */
export function createRfqSubmissionMachine(
  deps: RfqSubmissionDeps,
): Machine<RfqSubmissionState, RfqSubmissionIntents> {
  const store = createStore<RfqSubmissionState>(EDITING);
  let active: AbortController | null = null;
  let disposed = false;

  function endActive(): void {
    active?.abort();
    active = null;
  }

  async function run(
    input: CreateRfqInput,
    onRedirect: (rfqId: number) => void,
    signal: AbortSignal,
  ): Promise<void> {
    store.set(SUBMITTING);
    let rfqId: number;

    try {
      rfqId = await once(deps.createRfq(input), signal);
    } catch (error) {
      if (error instanceof AbortError) {
        throw error;
      }

      store.set(EDITING);
      return;
    }

    store.set({ status: "confirmed", rfqId });
    await sleep(RFQ_REDIRECT_DELAY_MS, signal);
    onRedirect(rfqId);
    store.set(EDITING);
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => {
        if (disposed) {
          return;
        }

        endActive();
        const controller = new AbortController();
        active = controller;
        void spawn(() => {
          return run(input, onRedirect, controller.signal);
        }, reportAsync);
      },
    },
    dispose: () => {
      disposed = true;
      endActive();
    },
  };
}
```

`packages/client-core-async/src/machines/ticketSubmission.ts`:

```ts
import type {
  Machine,
  Stream,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "@rtc/core-api";
import type { QuoteRequest } from "@rtc/domain";

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

export interface TicketSubmissionDeps {
  quoteRfq: (request: QuoteRequest) => Stream<void>;
  passQuote: (quoteId: number) => Stream<void>;
}

const NOT_SUBMITTED: TicketSubmissionState = { submitted: false };
const SUBMITTED: TicketSubmissionState = { submitted: true };

/** Either intent runs its command; success flips `submitted`, failure
 * leaves it false so the user can retry. A new intent aborts the command
 * in flight (the RxJS `switchMap`); `dispose()` aborts it. */
export function createTicketSubmissionMachine(
  deps: TicketSubmissionDeps,
): Machine<TicketSubmissionState, TicketSubmissionIntents> {
  const store = createStore<TicketSubmissionState>(NOT_SUBMITTED);
  let active: AbortController | null = null;
  let disposed = false;

  function endActive(): void {
    active?.abort();
    active = null;
  }

  function runCommand(command: Stream<void>): void {
    if (disposed) {
      return;
    }

    endActive();
    const controller = new AbortController();
    active = controller;
    void spawn(async () => {
      try {
        await once(command, controller.signal);
      } catch (error) {
        if (error instanceof AbortError) {
          throw error;
        }

        store.set(NOT_SUBMITTED);
        return;
      }

      store.set(SUBMITTED);
    }, reportAsync);
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      submitPrice: (quoteId: number, price: number) => {
        runCommand(deps.quoteRfq({ quoteId, price }));
      },
      pass: (quoteId: number) => {
        runCommand(deps.passQuote(quoteId));
      },
    },
    dispose: () => {
      disposed = true;
      endActive();
    },
  };
}
```

`packages/client-core-async/src/machines/rfqCountdown.ts`:

```ts
import type { ReadOnlyMachine } from "@rtc/core-api";
import { RFQ_COUNTDOWN_INTERVAL_MS } from "@rtc/domain";

import { storeToStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

/** `remainingMs` from `totalMs − elapsed` (read ONCE, at construction) down
 * to an inclusive 0, one tick per `RFQ_COUNTDOWN_INTERVAL_MS`, derived from
 * the tick index — never the clock — so fake timers are exact. `dispose()`
 * aborts the ticks. */
export function createRfqCountdownMachine(
  creationTimestamp: number,
  totalMs: number,
  now: () => number = Date.now,
): ReadOnlyMachine<number> {
  const initial = Math.max(0, totalMs - (now() - creationTimestamp));
  const store = createStore(initial);
  const controller = new AbortController();

  if (initial > 0) {
    void spawn(async () => {
      for (let tick = 1; ; tick += 1) {
        await sleep(RFQ_COUNTDOWN_INTERVAL_MS, controller.signal);
        const remaining = Math.max(0, initial - tick * RFQ_COUNTDOWN_INTERVAL_MS);
        store.set(remaining);

        if (remaining === 0) {
          return;
        }
      }
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

Run the machine tests, then the presenter tests. Expected: PASS.

- [ ] **Step 5: Composition, manifest, exports, wiring test**

`packages/client-core-async/src/composition.ts`:
- `nativePresenters`: add `rfqs: createRfqsPresenter(ports.workflow, lifetime)`, `dealers: createDealersPresenter(ports.dealers, lifetime)`, `instruments: createInstrumentsPresenter(ports.instruments, lifetime)`, `rfqQuote: createRfqQuotePresenter(ports.pricing)`; update the doc comment ("slice 3: the four credit presenters, of which `rfqs`, `dealers` and `instruments` hold their port subscriptions until `lifetime` aborts").
- `nativeMachines`: add

```ts
    rfqTile: (pair: CurrencyPair) => {
      return createRfqTileMachine(pair, {
        requestQuote: (symbol: string, pipsPosition: number) => {
          return presenters.rfqQuote.requestQuote(symbol, pipsPosition);
        },
      });
    },
    rfqSubmission: () => {
      return presenters.rfqs.createSubmission();
    },
    ticketSubmission: () => {
      return presenters.rfqs.createTicketSubmission();
    },
    rfqCountdown: (creationTimestamp: number, totalMs: number) => {
      return createRfqCountdownMachine(creationTimestamp, totalMs);
    },
```

`src/parity.json`: `rfqs`, `instruments`, `dealers`, `rfqQuote`, `rfqTile`, `rfqSubmission`, `ticketSubmission`, `rfqCountdown` → `"native"`.

`src/composition.machineFactories.test.ts`: add `"rfqTile reaches rfqQuote.requestQuote lazily — not at construction"` (spy not called after `machines.rfqTile(PAIR)`; called with `("EURUSD", 4)` after `intents.requestQuote()` — under fake timers), `"rfqSubmission and ticketSubmission reach for DIFFERENT rfqs members"` (spies `createSubmission`/`createTicketSubmission` each called once by their own factory and not by the other's), and extend the provenance case: `machines.rfqTile`, `machines.rfqCountdown` `not.toBe(base.…)`; the delegated example becomes `machines.boot`.

`src/index.ts`: export the four presenters' factories and the four machines' factories + `RfqTileDeps`, `RfqSubmissionDeps`, `TicketSubmissionDeps`.

`README.md` "Parity": "As of slice 3, **36 of 73** members are native…" plus one paragraph under "Conflation and machines" (rename the heading "Conflation, machines and commands" if it reads better): the credit shape — `once` over a port command per call, `deriveDistinct` + `createShallowArrayMemo` for the roster streams, the countdown from the tick index.

Run `pnpm --filter @rtc/client-core-async build` (no other build running), then `pnpm --filter @rtc/client-core-async test` (incl. `parity.test.ts` and `coreContract.test.ts`) and `pnpm --filter @rtc/client-core-async test:coverage`. Expected: green, ≥95/85. `pnpm check:deps` green (no new rxjs value import outside `bridge/`).

- [ ] **Step 6: Commit (by pathspec)**

```bash
git add packages/client-core-async
git commit -m "feat(client-core-async): slice 3 — rfqs, dealers, instruments, rfqQuote and the four RFQ machines native; parity 36/73" -- packages/client-core-async
```

---

### Task 5: The Effect core

**Files:**
- Create: `packages/client-core-effect/src/presenters/rfqs.ts`, `rfqQuote.ts`; `src/machines/{rfqTile,rfqSubmission,ticketSubmission,rfqCountdown}.ts`; tests beside each
- Modify: `src/presenters/warmSingletons.ts` (+ two), `src/layers.ts`, `src/layers.test.ts`, `src/composition.ts`, `src/composition.machineFactories.test.ts`, `src/parity.json`, `src/index.ts`, `README.md`

**Interfaces:**
- Consumes: the same domain/client-core exports as Task 4; bridge `sharedFold`, `mirrorPort`, `mirrorPortAsIs`, `streamToStream`, `refToStateStream`, `setRefIfChanged`, `createDetachedHost`, `rpc`; `presenterLayer`, `HostTag`, `AppPortsTag`.
- Produces: `createRfqsPresenter(host: EffectHost, workflow: WorkflowPort): RfqsPresenter`; `createDealersPresenter(host, dealers)`; `createInstrumentsPresenter(host, instruments)`; `createRfqQuotePresenter(host, pricing)`; the four machine factories with the same signatures as Task 4 (host-free); `RfqsTag`, `DealersTag`, `InstrumentsTag`, `RfqQuoteTag`.

- [ ] **Step 1: Write the failing presenter tests**

`rfqs.test.ts`, `rfqQuote.test.ts`, `warmSingletons.test.ts` (extended): the Task 4 cases, with the file's existing `useHost()`/`ManagedRuntime` helper and `settle()` (two zero advances or two real macrotasks as the file already does), plus, for `rfqs`: `workflow.events` counted ONCE at construction; the Subject observed after the first `rfqs$` subscriber; still observed after every subscriber left (retained); NOT observed after `Scope.close(host.scope)`.

- [ ] **Step 2: The presenters**

`packages/client-core-effect/src/presenters/rfqs.ts`:

```ts
import { Effect, Option, Stream } from "effect";

import { createShallowArrayMemo } from "@rtc/client-core";
import type {
  Machine,
  RfqSubmissionIntents,
  RfqSubmissionState,
  RfqsPresenter,
  Stream as CoreStream,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "@rtc/core-api";
import {
  type CreateRfqInput,
  CreateRfqUseCase,
  createEmptyRfqStreamState,
  type Quote,
  type QuoteRequest,
  reduceRfqEvent,
  type Rfq,
  type RfqStreamState,
  type WorkflowPort,
} from "@rtc/domain";

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  sharedFold,
  streamToStream,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createRfqSubmissionMachine } from "#/machines/rfqSubmission";
import { createTicketSubmissionMachine } from "#/machines/ticketSubmission";
import { mirrorPort, mirrorPortAsIs } from "#/presenters/mirrorPort";

/** A one-shot command as a Stream: the port is called only when subscribed
 * (`Effect.suspend`), the value is emitted and the stream completes. */
function command<T>(host: EffectHost, call: () => CoreStream<T>): CoreStream<T> {
  return streamToStream(
    host,
    Stream.fromEffect(
      Effect.suspend(() => {
        return rpc(call());
      }),
    ),
  );
}

/** The RFQ workflow: `workflow.events()` is called ONCE, here (ruling 6).
 * `events$` mirrors it retained; `state$` is a RETAINED fold of it with the
 * domain reducer from the domain seed, so a fresh subscriber of any
 * derivation seeds synchronously from the current state after every
 * consumer left (the RxJS `warmReplay()` over `state$`). `rfqs$`,
 * `allQuotes$` and the per-id `quotesForRfq$` are refCounted `mirrorPort`s
 * over it: the `Object.is` guard drops what `createShallowArrayMemo` hands
 * back unchanged — `distinctUntilChanged(shallowArrayEquals)` (ruling 5) —
 * and the reference check `allQuotes$` makes. */
export function createRfqsPresenter(
  host: EffectHost,
  workflow: WorkflowPort,
): RfqsPresenter {
  const source = workflow.events();
  const createUseCase = new CreateRfqUseCase(workflow);
  const events$ = mirrorPortAsIs(host, source, { retain: true });
  const state$ = sharedFold<RfqStreamState>(host, {
    retain: true,
    seed: () => {
      return Option.none();
    },
    run: (update: FoldUpdate<RfqStreamState>, fromPort: FromPort) => {
      let current = createEmptyRfqStreamState();
      return fromPort(source).pipe(
        Stream.runForEach((event) => {
          current = reduceRfqEvent(current, event);
          const next = current;
          return update(() => {
            return next;
          });
        }),
      );
    },
  });
  const quotesByRfq = new Map<number, CoreStream<readonly Quote[]>>();

  function createRfq(input: CreateRfqInput): CoreStream<number> {
    return command(host, () => {
      return createUseCase.execute(input);
    });
  }

  function quoteRfq(request: QuoteRequest): CoreStream<void> {
    return command(host, () => {
      return workflow.quote(request);
    });
  }

  function passQuote(quoteId: number): CoreStream<void> {
    return command(host, () => {
      return workflow.pass(quoteId);
    });
  }

  return {
    rfqs$: mirrorPort(
      host,
      state$,
      createShallowArrayMemo((s: RfqStreamState): readonly Rfq[] => {
        return Array.from(s.rfqs.values());
      }),
    ),
    allQuotes$: mirrorPort(host, state$, (s: RfqStreamState) => {
      return s.quotes;
    }),
    events$,
    quotesForRfq$: (rfqId: number) => {
      const cached = quotesByRfq.get(rfqId);

      if (cached !== undefined) {
        return cached;
      }

      const stream = mirrorPort(
        host,
        state$,
        createShallowArrayMemo((s: RfqStreamState): readonly Quote[] => {
          return Array.from(s.quotes.values()).filter((quote) => {
            return quote.rfqId === rfqId;
          });
        }),
      );
      quotesByRfq.set(rfqId, stream);
      return stream;
    },
    createRfq,
    acceptQuote: (quoteId: number) => {
      return command(host, () => {
        return workflow.accept(quoteId);
      });
    },
    cancelRfq: (rfqId: number) => {
      return command(host, () => {
        return workflow.cancelRfq(rfqId);
      });
    },
    passQuote,
    quoteRfq,
    createSubmission: (): Machine<RfqSubmissionState, RfqSubmissionIntents> => {
      return createRfqSubmissionMachine({ createRfq });
    },
    createTicketSubmission: (): Machine<
      TicketSubmissionState,
      TicketSubmissionIntents
    > => {
      return createTicketSubmissionMachine({ quoteRfq, passQuote });
    },
  };
}
```

(`mirrorPort`'s `seed` calls `peekCurrent(state$)` — a retained `sharedFold` with a live period answers synchronously, so a fresh `rfqs$` subscriber gets the roster in the caller's tick. One subtlety the implementer must keep: `createShallowArrayMemo` is created ONCE per derived stream, outside `mirrorPort`, so the memo survives across warm periods — the `seed` and the `run` projections share it.)

`warmSingletons.ts` — append `createDealersPresenter(host, dealers)` and `createInstrumentsPresenter(host, instruments)` as `mirrorPortAsIs(host, new DealersUseCase(dealers).execute(), { retain: true })` / the instruments twin, with the `currencyPairs` doc.

`rfqQuote.ts`:

```ts
import { Effect, Stream } from "effect";

import type { RfqQuotePresenter } from "@rtc/core-api";
import { type PricingPort, RfqQuoteUseCase } from "@rtc/domain";

import { type EffectHost, streamToStream } from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

/** One-shot FX RFQ quote: the port call is suspended until the returned
 * stream is subscribed; the result is emitted and the stream completes;
 * unsubscribing interrupts the fiber and with it the port subscription. */
export function createRfqQuotePresenter(
  host: EffectHost,
  pricing: PricingPort,
): RfqQuotePresenter {
  const useCase = new RfqQuoteUseCase(pricing);

  return {
    requestQuote: (symbol: string, pipsPosition: number) => {
      return streamToStream(
        host,
        Stream.fromEffect(
          Effect.suspend(() => {
            return rpc(useCase.execute(symbol, pipsPosition));
          }),
        ),
      );
    },
  };
}
```

- [ ] **Step 3: Write the failing machine tests** — the Task 4 cases, in the `rowHighlight.test.ts` (Effect) shape with its local `settle()` (two zero-length advances). For `rfqTile`: `cancel()` from requested releases the dep's subscription (`observed` false after `settle()`).

- [ ] **Step 4: The machines**

`packages/client-core-effect/src/machines/rfqTile.ts`:

```ts
import { Duration, Effect, Exit, Fiber, Option, Scope, SubscriptionRef } from "effect";

import type {
  Machine,
  RfqQuote,
  RfqState,
  RfqTileIntents,
  Stream,
} from "@rtc/core-api";
import {
  type CurrencyPair,
  REJECTED_DISPLAY_MS,
  RFQ_COUNTDOWN_INTERVAL_MS,
  RFQ_TIMEOUT_MS,
  type RfqQuoteResult,
} from "@rtc/domain";

import {
  createDetachedHost,
  refToStateStream,
  setRefIfChanged,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

export interface RfqTileDeps {
  requestQuote: (symbol: string, pipsPosition: number) => Stream<RfqQuoteResult>;
}

/** What a run writes with: a guard on the run token, so a run superseded a
 * fiber-step ago cannot write over its successor's state. */
type Write = (next: (current: RfqState) => RfqState) => Effect.Effect<void>;

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };
const REQUESTED: RfqState = { status: "requested", quote: null, remainingMs: 0 };
const REJECTED: RfqState = { status: "rejected", quote: null, remainingMs: 0 };

/** The RxJS machine's one-run-per-request shape on a `SubscriptionRef`
 * under a detached host: `requested`, then a received countdown derived
 * from the tick index in ONE looping fiber (never a timer that forks its
 * successor — §22), falling through to the rejected hold at zero, or the
 * hold at once when the request fails. `cancel`/`accept` interrupt the run
 * and reset; `reject` interrupts it and runs the hold alone; intents are
 * guarded to their state. Interruption releases the in-flight port call
 * through `rpc`'s finalizer. */
export function createRfqTileMachine(
  pair: CurrencyPair,
  deps: RfqTileDeps,
): Machine<RfqState, RfqTileIntents> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(SubscriptionRef.make<RfqState>(INIT));
  let active: object | null = null;
  let activeFiber: Fiber.RuntimeFiber<void> | null = null;
  let disposed = false;

  function current(): RfqState {
    return host.runtime.runSync(SubscriptionRef.get(ref));
  }

  function endActive(): void {
    active = null;

    if (activeFiber !== null) {
      Effect.runFork(Fiber.interrupt(activeFiber));
      activeFiber = null;
    }
  }

  function holdRejected(write: Write): Effect.Effect<void> {
    return Effect.gen(function* runRejectedHold() {
      yield* write(() => {
        return REJECTED;
      });
      yield* Effect.sleep(Duration.millis(REJECTED_DISPLAY_MS));
      yield* write(() => {
        return INIT;
      });
    });
  }

  function runQuote(write: Write): Effect.Effect<void> {
    return Effect.gen(function* runQuoteRequest() {
      yield* write(() => {
        return REQUESTED;
      });
      const result = yield* rpc(
        deps.requestQuote(pair.symbol, pair.pipsPosition),
      ).pipe(
        Effect.map(Option.some),
        Effect.catchAll(() => {
          return Effect.succeed(Option.none<RfqQuoteResult>());
        }),
      );

      if (Option.isSome(result)) {
        const quote: RfqQuote = {
          bid: result.value.bid,
          ask: result.value.ask,
          timeoutMs: RFQ_TIMEOUT_MS,
        };

        for (
          let remainingMs = RFQ_TIMEOUT_MS;
          remainingMs > 0;
          remainingMs -= RFQ_COUNTDOWN_INTERVAL_MS
        ) {
          const tick: RfqState = { status: "received", quote, remainingMs };
          yield* write(() => {
            return tick;
          });
          yield* Effect.sleep(Duration.millis(RFQ_COUNTDOWN_INTERVAL_MS));
        }
      }

      yield* holdRejected(write);
    });
  }

  function start(build: (write: Write) => Effect.Effect<void>): void {
    endActive();
    const token = {};
    active = token;

    function write(next: (state: RfqState) => RfqState): Effect.Effect<void> {
      return Effect.suspend(() => {
        return active === token ? setRefIfChanged(ref, next) : Effect.void;
      });
    }

    activeFiber = host.runtime.runFork(build(write), { scope: host.scope });
  }

  function reset(): void {
    endActive();
    host.runtime.runSync(
      setRefIfChanged(ref, () => {
        return INIT;
      }),
    );
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {
      requestQuote: () => {
        if (!disposed && current().status === "init") {
          start(runQuote);
        }
      },
      cancel: () => {
        if (!disposed && current().status === "requested") {
          reset();
        }
      },
      accept: () => {
        if (!disposed && current().status === "received") {
          reset();
        }
      },
      reject: () => {
        if (!disposed && current().status === "received") {
          start(holdRejected);
        }
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

(`type Write = …` is a function type alias, not an inline object literal — allowed. If `nursery/useExplicitType` or `func-style` objects to the nested `write` declaration, hoist it into a `createWrite(token)` factory returning the closure.)

`rfqSubmission.ts` — the same token/fiber shape: `submit` → `endActive()`, fork `Effect.gen`: write `SUBMITTING`; `rpc(deps.createRfq(input))` with `Effect.either`; on `Left` write `EDITING` and return; on `Right(rfqId)` write `{ status: "confirmed", rfqId }`, `Effect.sleep(RFQ_REDIRECT_DELAY_MS)`, `Effect.sync(() => onRedirect(rfqId))`, write `EDITING`. `dispose` = `endActive()` + close scope.

`ticketSubmission.ts` — `runCommand(stream)`: `endActive()`, fork `rpc(stream).pipe(Effect.matchEffect({ onFailure: () => write(() => NOT_SUBMITTED), onSuccess: () => write(() => SUBMITTED) }))`.

`rfqCountdown.ts` — `createDetachedHost()`, `SubscriptionRef.make(initial)`; if `initial > 0` fork ONE looping fiber: `for (let tick = 1; ; tick += 1) { yield* Effect.sleep(INTERVAL); const remaining = Math.max(0, initial − tick × INTERVAL); yield* setRefIfChanged(ref, () => remaining); if (remaining === 0) { return; } }`; `dispose` closes the scope. `now: () => number = Date.now` parameter as in Task 4.

Run the machine and presenter tests. Expected: PASS.

- [ ] **Step 5: Layers, composition, manifest, exports, wiring test**

`packages/client-core-effect/src/layers.ts`: four tags after `ExecutionTag` —

```ts
export const RfqsTag = Context.GenericTag<RfqsPresenter>(
  "@rtc/client-core-effect/rfqs",
);
export const DealersTag = Context.GenericTag<DealersPresenter>(
  "@rtc/client-core-effect/dealers",
);
export const InstrumentsTag = Context.GenericTag<InstrumentsPresenter>(
  "@rtc/client-core-effect/instruments",
);
export const RfqQuoteTag = Context.GenericTag<RfqQuotePresenter>(
  "@rtc/client-core-effect/rfqQuote",
);
```

`NativeServices` + the four types; four `presenterLayer`s (`RfqsLive` → `createRfqsPresenter(host, ports.workflow)`, `DealersLive` → `(host, ports.dealers)`, `InstrumentsLive` → `(host, ports.instruments)`, `RfqQuoteLive` → `(host, ports.pricing)`); add them to `independent` and to `nativePresentersEffect`. `layers.test.ts`: `toHaveLength(22)` → `26`.

`composition.ts` `nativeMachines`: the same four entries as Task 4 Step 5 (`rfqTile` over `presenters.rfqQuote.requestQuote`; `rfqSubmission`/`ticketSubmission` over `presenters.rfqs`; `rfqCountdown`). `composition.machineFactories.test.ts`: the Task 4 cases (adapt `createStubPresenters`: `rfqQuote.requestQuote` and `rfqs.createSubmission`/`createTicketSubmission` become `vi.fn` spies returning `of(undefined)` / a minimal machine `{ state$: NEVER, intents: {}, dispose: vi.fn() }` cast narrowly); dispose every built machine. `parity.json`: the eight → `"native"`. `index.ts`: export the new factories, deps types and tags. `README.md` "Parity": "As of slice 3, thirty-six members are **native**. Slice 3 added eight: …" plus a "Commands and countdowns" paragraph under "Conflation and machines": `rpc` under `Effect.suspend` per call; `mirrorPort` + `createShallowArrayMemo` for the roster derivations; the countdown as ONE looping fiber (the §22 fiber-ownership rule).

Run `pnpm --filter @rtc/client-core-effect build` (after Task 4's build has finished — never concurrently), then `test` and `test:coverage`. Expected: green, ≥95/85; `pnpm check:deps` green (`fromObservable` reached only through `fromPort`; no `effect` import outside the package).

- [ ] **Step 6: Commit (by pathspec)**

```bash
git add packages/client-core-effect
git commit -m "feat(client-core-effect): slice 3 — rfqs, dealers, instruments, rfqQuote as Layers; the four RFQ machines native; parity 36/73" -- packages/client-core-effect
```

---

### Task 6: Docs, status, and the slice gate — then ship PR B

**Files:**
- Modify: `docs/adr/ADR-006-pluggable-application-core.md` (after the "Decided in slice 2" block), `docs/architecture/22-pluggable-application-core.md` ("Warm singletons, conflation and machines" + "The contract tier" + "The parity manifest" counts), `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md` (receipt line after "Slice 2 shipped"), `CLAUDE.md` (Current Status paragraph; the `client-core-async` / `client-core-effect` rows in Package Structure; the "Application core rule" paragraph), `docs/STATUS.md` (the pluggable-core entry)
- Create: `docs/superpowers/plans/2026-09-20-pluggable-core-slice-3-rulings.md` (from the SDD ledger, the slice-2 format)

- [ ] **Step 1: ADR-006 — "Decided in slice 3"** (date 2026-09-20), bullets in the slice-2 style, one per ruling that survived execution: `rfqCountdown` joins the seam (why: the bindings bypassed it); the two cadences in `@rtc/domain` and the reducer seed exported; `shallowArrayEquals` + `createShallowArrayMemo` shared so roster suppression is contracted; one `workflow.events()` call per sibling; retained credit singletons; commands as `once`/`rpc` per call, lazy, completing; submission machines built by the presenter from its own commands; supersession by abort/interrupt; the countdown from the tick index with the clock read once; whatever asymmetries the runners surfaced (record them here, as slice 2 recorded three).

- [ ] **Step 2: §22** — add a fifth bullet to "Warm singletons, conflation and machines", **Commands, folds and countdowns** (credit): the shapes above in three sentences per core; update "twenty-eight members have real suites" → "thirty-six" in "The contract tier" and the parity paragraph ("thirty-six members `"native"` (…, the four credit presenters and the four RFQ machines — `rfqCountdown` having joined `MachineFactories` in slice 3)"); mention the harness's `createPendingQueue` beside the driver verbs.

- [ ] **Step 3: Spec receipt** — after the "Slice 2 shipped" line: `Slice 3 shipped 2026-09-20 (plan: [`../plans/2026-09-20-pluggable-core-slice-3.md`](../plans/2026-09-20-pluggable-core-slice-3.md)) — suites as PR A, ports as PR B; 36/73 native in both alternative cores; \`rfqCountdown\` joined \`MachineFactories\` (the bindings had bypassed the seam).`

- [ ] **Step 4: `CLAUDE.md`** — "twenty-eight members native … as of slice 2" → "thirty-six members native in both alternative cores as of slice 3 — connection, every preference presenter, `commands.reconnect`, the FX pricing/blotter/execution presenters and their five machines, the credit presenters and the four RFQ machines —"; the two package rows ("Slice 3: thirty-six members native …"); the Application core rule paragraph's parenthetical count.

- [ ] **Step 5: `docs/STATUS.md`** — the pluggable-core entry: headline "slice 3 shipped (2026-09-20); next: slice 4 (equities)" — `watchlist`, `candleSeries`, `depth`, `ordersBlotter`, `positions`; machines `eqWorkspace`, `eqDrawings`, `orderTicket` ("the two singletons the World harness instantiates"); their suites do not exist yet and must be green on RxJS first. Add the slice-3 plan link. Keep the slice-2 residual block; append any slice-3 residual the runners surfaced. Bump `Last updated`.

- [ ] **Step 6: Rulings ledger** — write `2026-09-20-pluggable-core-slice-3-rulings.md` from the SDD workspace ledger (both PRs' rulings; the slice-2 file is the template), commit it beside the plan.

- [ ] **Step 7: Doc links and formatting** — `pnpm check:doc-links`; `pnpm biome format --write` on the touched files if the gauntlet asks.

- [ ] **Step 8: The local CI mirror (one gauntlet for PR B)** — `/rtc:gauntlet full`; then `pnpm core:parity` (expect `native: async 36/73, effect 36/73`); `pnpm check:core-bundle` (the rxjs build carries no foreign marker; note the three gzip sizes in the PR body).

- [ ] **Step 9: The e2e matrix — the slice's exit criterion** — `pnpm test:e2e`, `pnpm test:e2e:async`, `pnpm test:e2e:effect`, each run UNPIPED and judged from the full summary (memory: a piped Playwright summary launders exit 1). All three green, including the credit Gherkin scenarios that drive the RFQ form, the ticket and the countdown.

- [ ] **Step 10: Commit and ship PR B**

```bash
git add docs CLAUDE.md
git commit -m "docs(pluggable-core): slice 3 receipts — ADR-006, §22, spec, CLAUDE.md, STATUS to slice 4; rulings ledger" -- docs CLAUDE.md
```

Push, open PR B ("feat(pluggable-core): slice 3 PR B — credit native in both cores; parity 36/73"), loop CI on `headSha`, CodeQL, merge `--merge`, confirm ancestor, remove the worktree and branch.

---

## Self-review

**Spec coverage.** Slice table row "3 credit": `rfqs` (Tasks 3/4/5), `dealers`, `instruments`, `rfqQuote` (3/4/5); machines `rfqTile`, `rfqSubmission`, `ticketSubmission` (3/4/5); `RfqCountdownMachine` — not a seam member today, made one in Task 1 (ruling 2) and ported in 4/5. "The `@rx-state` submissions" → the two submission machines; "the RFQ reducer" → imported from `@rtc/domain` with its seed (ruling 4). Exit criterion: suites (3), native in both (4, 5), e2e matrix (6 Step 9), `parity.json` (4, 5). "Pure reducers imported, not duplicated": `reduceRfqEvent`, `createEmptyRfqStreamState`, `shallowArrayEquals`, `createShallowArrayMemo`. Effect Tag/Layer composition: Task 5 Step 5. Contract tier "driver verbs arrive with the slices that assert on them": Task 2.

**Placeholder scan.** Task 5 Steps 2–4 describe `rfqSubmission`, `ticketSubmission`, `rfqCountdown` and the `warmSingletons` additions in prose against a fully-written sibling (`rfqTile.ts` in the same step; the Task 4 twins; slice 2's `tileExecution.ts`) — the implementer transcribes the named shape with the named calls; every constant, state and call site is stated. Task 1 Step 5's `composition.machineFactories.test.ts` case names the stub helper as the file has it and tells the implementer to read it. No "TBD", no "similar to".

**Type consistency.** `RfqTileDeps.requestQuote: (symbol, pipsPosition) => Stream<RfqQuoteResult>` in both cores matches `RfqQuotePresenter.requestQuote`. `RfqSubmissionDeps.createRfq: (input: CreateRfqInput) => Stream<number>` matches `RfqsPresenter.createRfq`. `TicketSubmissionDeps.quoteRfq/passQuote` match `RfqsPresenter.quoteRfq/passQuote`. `createRfqCountdownMachine(creationTimestamp, totalMs, now?)` matches `MachineFactories.rfqCountdown(creationTimestamp, totalMs)` (the wiring drops `now`). Driver verbs used by the suites — `emitRfqEvent`, `rfqEventsObserved`, `emitDealers`, `dealersObserved`, `emitInstruments`, `instrumentsObserved`, `pendingRfqQuotes`, `resolveRfqQuote`, `failRfqQuote`, `pendingWorkflowCommands`, `resolveWorkflowCommand`, `failWorkflowCommand` — are the twelve Task 2 declares. `PortMethodName` strings in `portDiscipline` — `"workflow.events"`, `"dealers.getDealers"`, `"instruments.getInstruments"` — are the three Task 2 adds. Fixture names — `createRfq`, `createQuote`, `createDealer`, `createInstrument`, `createRfqQuoteResult` — match Task 2 Step 3 and the `index.ts` exports. Registry key `"machines.rfqCountdown"` matches the `MachineFactories` member. Counts: 72 + 1 = 73 members; 28 + 8 = 36 native; `PENDING_SUITES` 45 − 8 = 37 (ruling R1 makes the new key pending in Task 1, so Task 3 removes eight, not seven); Effect layers 22 + 4 = 26.
