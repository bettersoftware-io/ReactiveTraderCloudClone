# Clean Architecture Alignment — Status

Tracks the multi-phase refactor that brings this codebase into alignment with `docs/architecture.md`. Read this first when resuming work after a break.

**Last updated:** 2026-05-11

---

## Current state

- **Branch:** `main`
- **Commits ahead of `origin/main`:** check `git log origin/main..HEAD`
- **Working tree:** clean except `.claude/settings.local.json` (Claude Code permission auto-grants; not a project file)
- **Test counts:** 141 unit (114 domain + 22 client + 5 server) + 40 e2e (Cucumber+Playwright) + 40 e2e (raw Playwright) + 40 e2e (Cucumber+Cypress)

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
| Phase 5A.4 — Raw Cypress reusing PO contracts | ⏳ NOT STARTED | (to be written) | — |
| Phase 5B — Presenter-direct step definitions for the same `.feature` files | ⏳ NOT STARTED | (to be written) | — |
| Phase 5C — Port contract tests (simulator vs WsReal) | ⏳ NOT STARTED | (to be written) | — |
| Phase 5D — Real gateway-events adapter; delete `withSyntheticGatewayConnected` | ⏳ NOT STARTED | (to be written) | — |

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

## Phase 5A.2 follow-ups (carry into Phase 5A.3+)

End-of-phase code review flagged the following non-blocking items; landed as-is in 5A.2 and tracked here for 5A.3+:

1. **`CypressWorkspace.ts` idiom unification.** All void methods return `cy.wrap(undefined) as unknown as Promise<void>` after firing cy commands separately, while every other Cypress PO uses `return <last-cy-command> as unknown as Promise<void>` (cast on the chain). The pattern works either way under the cucumber-shim, but `Workspace` is the lone outlier from the Task 10 era. Unify to the cast idiom when next touching the file.

2. **`cucumber-shim.ts` `isCyElement` guard.** The first branch of the result-type check (`isCyElement`) is not a documented Cypress API and is effectively unreachable in practice (the authoritative `Cypress.isCy(result)` on the next line handles all relevant cases). Either remove or comment which runtime case it defends against.

3. **STRINGS coverage expansion.** `tests/page-objects/contracts/strings.ts` currently has entries for `creditRfq` only. Other PO impls (e.g. `AnalyticsDashboard` section names, footer copy) still embed regex patterns directly in the impl. Acceptable for 5A.2 because no copy-as-selector is duplicated between drivers in those areas, but worth expanding for consistency in 5A.3+.

## Phase 5A.3 follow-ups (carry into Phase 5A.4+)

1. **`waitSeconds` is mis-located.** `tests/scenarios/fxLiveRates.ts` exports `waitSeconds`, but it wraps `ctx.po.workspace.wait` and has nothing FX-Live-Rates-specific. It is reused from `blotter.spec.ts` and `fxTrading.spec.ts`. Move to `tests/scenarios/common.ts` when next touching either file.

2. **`tests/.gitignore` `test-results/` line is redundant.** The repo-root `.gitignore` already covers `test-results/`. The defense-in-depth entry is harmless but could be dropped if/when consolidating ignore rules.

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
