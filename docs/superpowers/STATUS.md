# Clean Architecture Alignment — Status

Tracks the multi-phase refactor that brings this codebase into alignment with `docs/architecture.md`. Read this first when resuming work after a break.

**Last updated:** 2026-05-30 (architecture.md consistency pass + connection reconnecting-state implementation)

---

## Current state

- **Branch:** `main`
- **Commits ahead of `origin/main`:** check `git log origin/main..HEAD`
- **Working tree:** clean except `.claude/settings.local.json` (Claude Code permission auto-grants; not a project file)
- **Test counts:** 211 unit (139 domain + 67 client + 5 server) + 48 (Cucumber+Playwright) + 48 (raw Playwright) + 48 (Cucumber+Cypress) + 48 (raw Cypress) + 19 (presenter-cucumber-real) + 19 (presenter-cucumber-fake) + 19 (presenter-vitest-fake) + 19 (presenter-vitest-plain) — 48×4 + 19×4 = 268 e2e scenarios (4 browser peers × 48 scenarios; 4 presenter peers × 19 scenarios)

## Phases

| Phase | Status | Plan | Commits |
|---|---|---|---|
| Phase 1 — Rename `mock/` → `simulators/`, all `Mock*` classes → `*Simulator`, constants → `*_CATALOG` | ✅ DONE | `plans/2026-04-30-clean-architecture-alignment.md` | `a67b8f9..48d8f20` (9 commits) |
| Phase 2 — Extract Use Cases from React hooks (6 use cases in `packages/domain/src/usecases/`) | ✅ DONE | `plans/2026-05-01-phase-2-extract-use-cases.md` | `6cebdc5..e92f532` (7 commits) |
| Phase 2.5 — Rename all source files to camelCase / PascalCase (drop kebab-case) | ✅ DONE | `plans/2026-05-02-phase-2-5-rename-files-camelcase.md` | `69c17ac..e93fc29` (14 commits) |
| Phase 2.6 — Replace `AsyncIterable<T>` boundary with RxJS `Observable<T>` (rxjs becomes the explicit architectural exception in `@rtc/domain`) | ✅ DONE | `plans/2026-05-03-phase-2-6-rxjs-observable-boundary.md` | `da7cc7f..285e19e` (9 commits) |
| Phase 3 — Presenters + react-rxjs hook bridge + Composition Root (retire `ServiceProvider`) | ✅ DONE | `plans/2026-05-05-phase-3-presenters-react-rxjs-composition-root.md` | `94d6f6e..3434bd7` (14 tasks + 2 review follow-ups, 17 commits) |
| Phase 4 — Reorganise `packages/client/src/` into `app/` + `ui/` subtrees | ✅ DONE | `plans/2026-05-07-phase-4-app-ui-reorg.md` | `dd84f6a..10861fe` (10 task commits) + this STATUS update |
| Phase 5A.1 — Gherkin + page objects (Cucumber + Playwright) | ✅ DONE | `plans/2026-05-08-phase-5a-1-gherkin-page-objects.md` | `49e5764..892c128` (15 commits) |
| Phase 5A.2 — Cucumber + Cypress sharing the same `.feature` files | ✅ DONE | `plans/2026-05-10-phase-5a-2-cypress-cucumber.md` | `c8706ec..05ecee4` (24 task commits) + this STATUS update |
| Phase 5A.3 — Raw Playwright reusing PO contracts | ✅ DONE | `plans/2026-05-10-phase-5a-3-raw-playwright-po-contracts.md` | `f26ae72..55a5fe7` (11 task commits) + this STATUS update |
| Phase 5A.4 — Raw Cypress reusing PO contracts | ✅ DONE | `plans/2026-05-11-phase-5a-4-raw-cypress-po-contracts.md` | `3356d7e..936408f` (21 task commits incl. 3 spec amendments + 2 revert pairs reflecting the §3 hard-stop → §3.3 forked-scenarios decision) + this STATUS update |
| Phase 5B.1 — Cucumber-JS + real-time presenter step defs (foundation for 5B comparison artifact) | ✅ DONE | `plans/2026-05-16-phase-5b-1-presenter-direct-step-defs.md` | `eecc786..00bc43b` (20 task commits) + this STATUS update |
| Phase 5B.2 — Cucumber-JS + fake timers (virtual time) | ✅ DONE | `plans/2026-05-17-phase-5b-2-cucumber-fake-timers.md` | `22c77ff..47c43df` (12 task commits) + this STATUS update |
| Phase 5B.3 — Vitest + Gherkin + fake timers | ✅ DONE | `plans/2026-05-17-phase-5b-3-vitest-gherkin-fake-timers.md` | `9c3bfc2..cf75376` (10 task commits incl. 1 code-quality fix) + this STATUS update |
| Phase 5B.4 — Vitest + plain TS (no Gherkin) + fake timers | ✅ DONE | `plans/2026-05-17-phase-5b-4-vitest-plain-fake-timers.md` | `c78b93d..077386d` (11 task commits) + this STATUS update |
| Phase 5C — Port contract tests (simulator vs WsReal) | ✅ DONE | `plans/2026-05-18-phase-5c-port-contract-tests.md` | `769a47b..23db8c7` (18 task commits + 2 fixture-fix commits) + this STATUS update |
| Phase 5D — Real gateway-events adapter; delete `withSyntheticGatewayConnected` | ✅ DONE | `plans/2026-05-19-phase-5d-real-gateway-events.md` | `45fe824..d365ca8` (13 commits) + this STATUS update |
| Phase 5E — Follow-up cleanups + STATUS.md grooming | ✅ DONE | `plans/2026-05-20-phase-5e-cleanup.md` | `6d86565..3aff596` (13 commits) + this STATUS update |

## Use cases extracted in Phase 2

All in `packages/domain/src/usecases/`:

- `PriceStreamUseCase` — was `enrichTick` + `previousMid` ref in `usePriceStream`
- `PriceHistoryUseCase` — was `PRICE_HISTORY_SIZE` ring buffer in `usePriceHistory`
- `ExecuteTradeUseCase` — was rate selection + dealt-currency derivation + status mapping in `useExecuteTrade`
- `AnalyticsUseCase` — was hardcoded `"USD"` base currency in `useAnalytics`
- `WorkflowEventStreamUseCase` + standalone `reduceRfqEvent` — was the 8-variant RfqEvent fold in `useRfqStream`
- `CreateRfqUseCase` — was `quantity * CREDIT_QUANTITY_MULTIPLIER` + hardcoded `expirySecs: 120` in `useCreateRfq`

## Hooks NOT touched in Phase 2 (deferred to Phase 3)

Pure pass-through hooks (no application logic to extract):

- `useCurrencyPairs`, `useTradeStream`, `useInstruments`, `useDealers`, `useConnection`

Plus one that needs a port-interface evolution before extraction is clean:

- `useRfqQuote` — currently duck-types `getRfqQuote` on the simulator; clean extraction requires extending `PricingPort`. Defer to Phase 3 when the presenter layer arrives.

Plus the workflow command companions (currently called via `useServices()` directly):

- `cancelRfq`, `acceptQuote`, `passQuote`, `quote` — wrap in use cases when needed by Phase 3 presenters.

## Phase 2 lessons / corrections

Implementer subagents caught three plan-level errors during execution:

1. **Test math** — `bid=1.10000, ask=1.10002` is 0.2 pips, not 2.0 (fixed in Task 2.1: changed to `ask=1.10020`).
2. **Type-name drift** — `Trade.tradeName` (NOT `traderName`); `Price.spread` is `string` (NOT `number`); no `Price.version` field exists. Fixed in Task 2.3.
3. **State-field naming** — `useRfqStream` internal state used `rfqs`/`quotes`, not `rfqsById`/`quotesById` as the plan assumed. Fixed in Task 2.5; `RfqStreamState` adopted the existing names.

For future plans: read the actual entity types and existing hook bodies before writing test fixtures and use case interfaces.

## Phase 3 lessons / corrections

Five non-trivial corrections surfaced during execution:

1. **Missing root-index re-exports** — The five new use cases added in Task 3 (`CurrencyPairsUseCase`, `TradeBlotterUseCase`, `InstrumentsUseCase`, `DealersUseCase`, `RfqQuoteUseCase`) were not re-exported from `packages/domain/src/index.ts`, only from the use-cases barrel. Caught in Task 7 review; fixed by adding them to the root index.
2. **`PriceHistoryPresenter` must use `PriceHistoryUseCase`** — The plan initially called `getPriceHistory` directly on the port. The use case's ring-buffer accumulation is needed for live-tick accumulation; switching to `PriceHistoryUseCase` preserved correct behaviour.
3. **`useRfqState` method names** — The plan spec listed method names `requested/received/rejected` for `useRfqState`; the actual implementation uses `initiate/receiveQuote/reject`. Tests were written against the correct names.
4. **`useQuoteRfq` in `TradeTicket.tsx`** — The plan only listed `SellSidePanel.tsx` as needing `useQuoteRfq`. `TradeTicket.tsx` also required it; added during Task 12 migration.
5. **`browserOnline` → `CONNECTING` not `CONNECTED`** — The `withSyntheticGatewayConnected` function in `composition.ts` initially only synthesized a single `gatewayConnected` at startup. After coming back online, the state machine returned to `CONNECTING` (not `CONNECTED`) because no new `gatewayConnected` event fired. Fixed in Task 14 by also synthesizing `gatewayConnected` after every `browserOnline` event (restoring the mock-mode behaviour of the retired `ConnectionProvider`).

## Phase 3 follow-ups (carry into Phase 5B/5D)

End-of-phase code review flagged improvements that were not addressed in Phase 3; tracked here to carry into Phase 5B (presenter-direct step defs) and Phase 5D (real gateway adapter):

1. **Replace `withSyntheticGatewayConnected` with a real gateway-events adapter.** `composition.ts` synthesises `gatewayConnected` at boot and after every `browserOnline` event. This works in simulator mode and matches the legacy `ConnectionProvider` behaviour, but in WS-real mode it can produce a CONNECTED → DISCONNECTED flash on reconnect when the server is actually down. Phase 4 should fold a real `WsAdapter`-driven `ConnectionEventsPort` adapter into the composition root and delete `withSyntheticGatewayConnected` entirely. The state machine itself is correct; only the synthetic event source is the workaround.

2. **Strengthen presenter test depth.** The simple stream presenters (`Blotter`, `Analytics`, `CurrencyPairs`, `Instruments`, `Dealers`) have one assertion each (basic delegation). The hybrid `RfqsPresenter`'s `distinctUntilChanged` suppression and `shareReplay` multicast contract aren't directly asserted at the presenter-test layer. Spec §6 deferred component-level tests to Phase 5; presenter-level coverage gaps fit naturally with that work — add `distinctUntilChanged` suppression + `shareReplay` multicast tests when the harness expands.

## Phase 5A.4 follow-ups (carry into Phase 5B+)

1. **Default timeout drift in `expectTradeConfirmationMatchesOneOf`.** Task 6 originally diverged (10s vs shared 5s); fixed in commit `0214f0c`. Worth a note that other scenario fns that internally apply a default timeout should be cross-checked against their shared counterparts the next time someone tweaks the timing layer.

2. **Spec history.** §3.1, §3.2, §3.3 are all in the spec as audit trail. Future readers will see the dead ends. Consider whether to leave them (preserves the "what we tried and why it failed" learning) or collapse into a single §3 section. Currently leaning toward leaving them — the failure modes documented are exactly the kind of Cypress quirks that bite contributors next time someone considers async/await in a raw Cypress body.

## Phase 5B.1 follow-ups (carry into 5B.2+)

1. **App teardown.** `createApp` does not return a `dispose()` method. If subscription leaks cause flake across scenarios, add one. Recorded as a risk; defer to first sub-phase that surfaces flake.

2. **`Subject` vs `BehaviorSubject` for `connectionEvents$`.** A step subscribing before the first event misses it. Acceptable in 5B.1 (events come from explicit step bodies); revisit if scenarios get more complex.

3. **Browser-side step coverage for new scenarios.** Several new @presenter scenarios required adding step-def synonyms on the browser side. If these become idiomatic, consider extracting common phrasing patterns.

4. **`@rtc/client` package exports.** 5B.1 added a top-level barrel + `exports` field + `tsconfig.types.json` for declaration emission. Other tooling that imports `@rtc/client` (Vite build, server, etc.) wasn't affected, but verify on the next major dep bump.

5. **GBPJPY-targeted rejection.** `buyNTimesWithDismissals` in shared browser scenarios now targets GBPJPY for n-th buy to guarantee a rejection. Behavior shift for n=1 (only-GBPJPY); no current caller uses n=1. Worth a name change if a future scenario uses n=1.

6. **Dead scratchpad fields.** ✅ RESOLVED in commit `b41e5e5` (2026-05-18) — pruned `lastPrice`, `observedTradeCount`, `lastTradeDirection`, `recordedCount` from `PresenterScratchpad` along with nine write sites in `_shared/fxLiveRates.ts` and `_shared/fxTrading.ts`. `expectPriceTileVisibleWithin` and `recordFirstTileText` retain their subscription side effects (load-bearing in fake-time peers) but no longer bind the result.

## Phase 5B.2 follow-ups (carry into 5B.3+)

1. **Precision-tick mode.** If a future scenario chains time-bounded waits where over-advance matters, switch fake-world `awaitFirstWithin` to a `nextAsync` probe loop (advance to next scheduled timer, check promise state, repeat until promise resolved or deadline reached).
2. **Plan note correction.** The plan claimed `priceStream.price$(pair)` and `currencyPairs.pairs$` are both sync-on-subscribe. Only the former is true — `pairs$` is `of(...).pipe(delay(1000))` and required `w.awaitFirstWithin` wrapping in `expectPriceTileVisibleWithin` (fxLiveRates.ts) and both `currencyPairs.pairs$` reads in `fxTrading.ts`. Two fix commits: `0f85701`, and inline-fixed in `b34c7e5`. Future plans should grep simulators before claiming sync-on-subscribe.
3. **`@sinonjs/fake-timers` v14 does NOT bundle TS types.** Required adding `@types/sinonjs__fake-timers@^15.0.1` to `tests/package.json` devDependencies (commit `112e02d`).

## Phase 5B.3 follow-ups (carry into 5B.4+)

1. **qpickle-loader's step-timeout interacts with vitest fake timers.** quickpickle wraps each step in `Promise.race([work, setTimeout(reject, stepTimeout)])`. `vi.useFakeTimers()` patches `global.setTimeout`, so `vi.advanceTimersByTimeAsync(N)` ALSO fires the step-timeout when `N >= stepTimeout`. `tests/vitest-presenter-fake.config.ts` raises `stepTimeout: 60_000` (well above the worst-case 30s advance in `buyNTimesWithDismissals`). Documented inline in the config; carry into 5B.4 if Vitest is reused there.
2. **Vitest worker startup overhead.** ~0.5s gap between cucumber-fake (~1s) and vitest-fake (~1.5s) is dominated by Vitest's thread-pool boot. Acceptable here, but flag if 5B.4's plain-TS variant doesn't show the same delta — would indicate the loader plugin itself adds non-trivial cost worth profiling.
3. **Step-tree triplication.** Three step trees (cucumber-real, cucumber-fake, vitest-fake) now exist as near-identical mirrors. 5B.3 deliberately forks them to make the runner difference visible; if a fourth peer (5B.4) lands, revisit whether a single source-of-truth step registry that adapts to each lib makes sense — but only after 5B.4 confirms the duplication cost is real.
4. **Plan-template drift.** The Phase 5B.3 plan templates the step/hook callbacks as cucumber-js's `function(this: PresenterWorld)` shape (Task 4 hooks + Task 5 step files). That shape doesn't compile against qpickle-loader's actual types — `HookFunction = (state) => Promise<void>` and step `f: (state, ...args) => any`. Shipped code uses `async (state: VitestFakePresenterWorld, ...args) =>` across all hooks + 8 step files. Future readers grepping the plan should not trust those templates verbatim. The plan doc itself was not amended post-shipment; the actual code is the source of truth.
5. **qpickle-loader dep-graph quirks.** `quickpickle@1.11.2` pulls in both `lodash@4.18.1` and `lodash-es@4.18.1` (CommonJS + ESM duplicates), AND adds a fourth concurrent `@cucumber/gherkin` version to the lockfile (`32.2.0` via `@cucumber/messages@27.2.0`, alongside the existing 30.0.4 / 31.0.0 / 38.0.0). Neither is a defect introduced by us — upstream quirks of qpickle-loader's own dep design — but worth flagging for any future audit targeting `@rtc/tests` bundle size or transitive graph.

## Phase 5B.4 follow-ups (carry into 5C+)

1. **Scratchpad audit.** ✅ RESOLVED in commit `b41e5e5` (2026-05-18) — see Phase 5B.1 follow-up #6.

2. **Step-tree de-duplication.** 5B.3 follow-up #3 suggested revisiting a "source-of-truth step registry" after 5B.4. vitest-plain has no step tree, so it doesn't add to the triplication. Re-evaluate as part of 5C.

3. **Gate 21 catches add/remove drift only.** Step-body changes inside an existing `@presenter` scenario won't trip gate 21 (e.g., editing a Gherkin step's text or arguments will not fail the gate). Acceptable for 5B.4 because the 19 `@presenter` scenarios are frozen by the 5B comparison artifact; revisit if presenter scenarios start changing meaningfully.

4. **`@presenter` tag in `describe` title is convention, not enforced.** ✅ RESOLVED in commit `df91926` (2026-05-18) — added gate 22 + `checkPresenterDescribePrefix` helper asserting every `describe(...)` title in `presenter-tests/vitest-plain/*.test.ts` starts with `"@presenter Feature: "`. Smoke-tested by temporarily stripping the prefix on `blotter.test.ts`: the gate failed with a precise file + offending title, then passed once restored.

5. **Naming asymmetry.** vitest-plain lives in `tests/presenter-tests/`, while the other 3 presenter peers' glue lives under `tests/steps/presenter/` and `tests/support/presenter/`. Deliberate (`steps/` is a misnomer for files with no step defs), but a reader scanning the file tree won't see all 4 presenter peers at one level. The STATUS phases table and `docs/architecture.md` presenter test stack table provide the unified view.

## Phase 5C follow-ups (carry into 5D+)

1. **Type-only filtering in `WorkflowPortContract`.** The describer's `isRfqCreated`/`isAccepted` guards filter on `e.type` only, not on rfqId/quoteId, because the simulator generates IDs internally while WsReal relays them — so a portable describer cannot assert specific ID round-trips. Specific ID round-trips are covered (or should be) by per-impl use-case tests. Phase 5D can revisit if a stronger contract becomes useful.

2. **`supportsLiveAdd` capability flag on Instrument/Dealer harnesses.** Both `InstrumentSimulator` and `DealerSimulator` are static (return `of(CATALOG)`) so the "subsequent emissions are full snapshots" invariant fast-paths through `teardown()` and asserts nothing. The simulator-side test passes vacuously. If/when either simulator gains a live-add API, flip the flag and the assertion runs for real.

## Phase 5D follow-ups (carry into 5E+)

1. **`WsAdapter.ts` size review.** With the lifecycle additions, the class now juggles message I/O, reconnect scheduling, RPC tracking, AND lifecycle observation. The file is still readable (<200 lines), but a future contributor may benefit from splitting lifecycle observation into a helper or rethinking the reconnect loop.
2. **State-diagram `DISCONNECTED → CONNECTING : reconnectAttempt every 10s`** — ✅ RESOLVED (2026-05-30). Implemented the intermediate transition: added a `reconnectAttempt` event to the `ConnectionEvent` union + the `DISCONNECTED → CONNECTING` case in `nextConnectionStatus`; `WsAdapter.scheduleReconnect` now emits `reconnectAttempt` when the retry timer fires (before re-`connect()`); the composition root feeds `RECONNECT_INTERVAL_MS` (10s) as `WsAdapter`'s `reconnectDelayMs` so the previously-dead constant is now load-bearing. Covered by 2 new domain transition tests + 1 new `WsAdapter` emission test (208 → 211 unit tests).
3. **Double `gatewayDisconnected` on browser-offline.** When the browser goes offline, both `BrowserConnectionEventsAdapter` (immediate `browserOffline`) and `WsAdapter` (`onclose` from TCP teardown) emit events. The state machine handles this correctly via default branches in OFFLINE_DISCONNECTED, but the duplication is conceptually ugly and could be cleaned up by gating WS lifecycle emissions on the browser state.
4. **Simulator-mode browserOnline → gatewayConnected synthesis.** Discovered during Task 10 e2e verification: simulator mode needs a `mergeMap` in `composition.ts` to fake `gatewayConnected` after each `browserOnline`, because `ConnectionEventsSimulator` is one-shot. This is a partial reintroduction of synthetic behavior, scoped to simulator mode only (WS-real reconnect handles itself via real `onopen`). The plan/spec assumed all e2e ran in WS-real mode; it doesn't (no `VITE_SERVER_URL` is set in dev). Consider whether a `SimulatorReconnectAdapter` or richer simulator design would better encapsulate this.
5. **No `ConnectionEventsPort` contract test layer.** Phase 5C's 8-port contract pattern doesn't extend here because simulator and WS-real impls are fundamentally divergent (one-shot vs long-lived lifecycle). Revisit if a third impl emerges (e.g. server-side health-ping).

## Phase 5E follow-ups (carry into 5F+)

_No new follow-ups; Phase 5E pruned 14 items from previous follow-up sections._

## Open questions for Phase 3 (brainstorm before writing the plan)

1. **react-rxjs version + dependency**: `rxjs ^7.8` is already in `@rtc/client`. `react-rxjs` to be added — confirm latest version + interop with React 19.

2. **Presenter ownership of derived state**: `useRfqStream` returns `rfqs: Rfq[]`, `getQuotesForRfq(rfqId)`, and `allQuotes: Map<>`. Today the hook computes the array projections and the filter callback. With a presenter + react-rxjs, do we expose:
   - One stream of full `RfqStreamState` snapshots and let UI components project (current shape, simple)?
   - Multiple narrower streams (e.g. `rfqs$`, `quotesByRfq$(rfqId)`) generated by react-rxjs `bind()` (more idiomatic, more code)?

3. **Composition Root location**: replaces `packages/client/src/services/service-provider.tsx`. Options:
   - New file `packages/client/src/app/composition.ts` (runs at startup, returns wired-up presenters).
   - Keep folder structure flat for now, do the reorg in Phase 4.

4. **`useRfqQuote` cleanup**: defer until `PricingPort.getRfqQuote` exists. Whose use case is it — `RfqQuoteUseCase` taking `PricingPort` (with the new method)?

5. **Pure-pass-through hooks**: should Phase 3 give them use cases (consistency) or just create presenters that call ports directly (less ceremony)?

6. **`Map` vs `ReadonlyMap` mutability** issue from Phase 2: `useRfqStream` returns `allQuotes: Map<number, Quote>` because consumers expect mutable. Phase 3's presenter layer could expose `ReadonlyMap` cleanly if consumers can be updated.

## Architectural anchors (already in repo)

- **Target architecture**: `docs/architecture.md` (full spec, with diagrams).
- **Phase 1 plan** (executed): `docs/superpowers/plans/2026-04-30-clean-architecture-alignment.md`.
- **Phase 2 plan** (executed): `docs/superpowers/plans/2026-05-01-phase-2-extract-use-cases.md`.
- **Project rules**: `CLAUDE.md` (zero-dep domain, `AsyncIterable<T>` boundaries, "make choices, defer commitment").

## Resuming work

When you come back:

1. Confirm `git status` is clean. If `.claude/settings.local.json` is dirty, ignore.
2. Confirm `git log origin/main..HEAD` (if origin updated) — push if not yet pushed.
3. **Phase 5A.2 is complete.** Cucumber-JS (Playwright) + Cypress share one step tree via the bundler-alias seam documented in `docs/architecture.md §9.5`. All 18 tasks done.
4. The two Phase 3 follow-ups (real gateway adapter; presenter test depth) can fold into Phase 5 work or be carved off separately — decide during brainstorming.
