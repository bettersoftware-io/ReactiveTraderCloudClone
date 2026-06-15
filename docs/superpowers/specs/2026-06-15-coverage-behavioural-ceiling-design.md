# Drive All Coverage Tiers to Their Behavioural Ceiling — Design

**Date:** 2026-06-15

**Status:** Approved (brainstorming) — ready for implementation plan

## Goal

Raise every coverage-collecting tier in the repo toward ~100% **by adding
behavioural tests and committing missing visual goldens** — never by writing
implementation-detail/change-detector tests, adding ignore-pragmas, or
refactoring production `src/`. Where a line can only be closed by a forbidden
technique, it is left uncovered and documented. The realistic target is each
tier's **honest behavioural ceiling**, not a literal 100%.

## Governing policy (hard constraints)

- **Behaviour, not implementation.** Every new test asserts an observable
  input→output / stimulus→emission, and must survive refactors.
- **No ignore-pragmas** (`v8 ignore`, `istanbul ignore`) in production code.
- **No production `src/` edits** — tests + test/coverage config only.
- **Honest denominator via config exclude is allowed** (not a pragma): bootstrap
  / wiring files that cannot be unit-tested without a refactor are excluded from
  the coverage `include`/`exclude` with a reason comment — the same move already
  shipped for the server's `index.ts` + `serviceContainer.ts`.

## The five coverage tiers (baseline → behavioural ceiling)

| # | Script | Engine | Scope | Baseline (stmt/br) | Ceiling target |
|---|--------|--------|-------|--------------------|----------------|
| 1 | `@rtc/domain test:coverage` | v8 | `domain/src/**` | 88.1% / 70.6% | ~92% / ~90% |
| 2 | `@rtc/server test:coverage` | v8 | `server/src/**` (–bootstrap) | 79.6% / 54.5% | ~95% / ~83% |
| 3 | `@rtc/client test:app:coverage` | v8 | `client/src/app` | 71.7% / 47.5% | ~90% / ~62% |
| 4 | `@rtc/client test:ui:contract:coverage` | v8 | `client/src/ui` | 99.2% / 97.7% | **no work — at ceiling** |
| 5 | `@rtc/client test:ui:visual:…:coverage` | istanbul | `client/src/ui` (rendered) | 54.1% / 42.3% | ~95% (after include-narrowing) |

These are report-only; **no CI threshold gate is added** (consistent with the
existing coverage workstream).

## Tier 1 — `@rtc/domain` (behavioural)

Add behavioural tests for:

- **`simulators/CreditRfqSimulator.ts`** (largest gap, 30% br) — exercise the
  **public port methods** only: `cancelRfq()` (open RFQ → `rfqClosed`/`Cancelled`
  event; unknown id → no-op), `pass()` (quote → `quotePassed`), `accept()`
  including the **competing-quote auto-rejection** (2 dealers, accept one →
  other becomes `rejectedWithPrice`), and the dealer-response timer path via
  fake timers (advance past `DEALER_RESPONSE_WINDOW_MS` → quote priced + event).
  These are observable through the events stream — not internal-state spying.
  *(This reverses the earlier `2026-06-14` spec's deferral of this file; that
  deferral was about chasing internal state-machine branches. We now cover the
  public methods, which is behavioural; genuinely-internal branches stay
  uncovered.)*
- **`connection/connectionStatus.ts`** — `CONNECTING` + `browserOffline` →
  `OFFLINE_DISCONNECTED` transition.
- **`simulators/PricingSimulator.ts`** — unknown-symbol error on
  `getPriceUpdates`/`getRfqQuote`; live-tick history cap (`shift()` after
  `PRICE_HISTORY_SIZE`).
- **`simulators/AnalyticsSimulator.ts`** — history rollover past `HISTORY_SIZE`.
- **Port-contract describers** (`Dealer`/`Instrument`/`Analytics`) — drive the
  static-port (`supportsLiveAdd:false`) early-return arm and the minimal-history
  (`< 2` entries) arm via a tiny in-test harness.

**Left uncovered (documented):** exhaustive-`switch` defaults and type-narrowing
fallbacks in `connectionStatus` and the simulators.

## Tier 2 — `@rtc/server` (behavioural)

Extend `packages/server/src/ws/wsHandler.test.ts` with 21 behavioural tests:

- **9 stream-error callbacks** — for each subscription (`referenceData`,
  `pricing`, `blotter`, `analytics`, `instruments`, `dealers`, `workflow`):
  inject a service returning `throwError(...)`, assert the error is logged and
  the subscription is removed from the set (no further frames). Reuse the
  existing `FakeWs`/`fakeServices`/`connect` harness; spy `console.error` via
  `vi.spyOn`.
- **4 workflow quote-transform branches** — emit `quoteCreated`, `quoteQuoted`,
  `quotePassed`, `quoteAccepted` events and assert the `WorkflowEventDto` shape
  per type (the existing suite only drives the SoW + `rfqCreated` arms).
- **8 RPC synchronous-throw catch blocks** — distinct from the async-nack paths
  the existing contract suite already covers: a service whose method **throws
  synchronously** (`() => { throw new Error() }`) must still produce a `nack`
  with the echoed `correlationId`, for `executeTrade`, `getPriceHistory`,
  `createRfq`, `cancelRfq`, `quote`, `pass`, `accept`, `setThroughput`.

**Left uncovered (documented):** the `send()` socket-closed guard (line 30) and
the in-stream abort-signal race guards — both genuine production race protection,
unreachable in deterministic unit time.

## Tier 3 — `@rtc/client src/app` (behavioural + bootstrap exclude)

The biggest real gap. Add ~23 behavioural tests:

- **`WsAdapter.ts`** — malformed-JSON inbound frame ignored; RPC response for an
  unknown `correlationId` routed to stream handlers; RPC rejects when socket not
  open; `waitForConnection()` polling resolves once open; `dispose()` rejects
  pending RPCs; disposed-state suppresses `onclose` re-emit; reconnect-timer arm.
- **`portFactory.ts`** — `createSimulatorPorts()` wiring (all 8 ports); RPC
  **nack** mapping for the 6 RPC methods; unsubscribe/cancellation handlers.
- **`RfqsPresenter.ts`** — `allQuotes$` emission; `shallowArrayEquals` length +
  element-diff arms; `quotesForRfq$()` caching (second call returns the cached
  observable).

**Honest denominator:** add `coverage.exclude` for **`src/app/composition.ts`**
(env-detection + `new X()` wiring + DOM bootstrap; covered by `tests/fullstack`
smokes), with a reason comment — mirroring the server bootstrap exclude.

**Left uncovered (documented):** `BrowserConnectionEventsAdapter` idle-timer
cleanup guard (defensive).

## Tier 4 — `@rtc/client src/ui` contract tier (no work)

At 99.2%/97.7%. Every residual gap (timer race-guards in `useTileState`/
`useThroughput`, optional-prop guards, exhaustive `filterState` fallback) is
**defensive** — closable only by impl-detail tests, which the policy forbids.
**No tests are added.** The plan records the residual as the documented ceiling.

## Tier 5 — `@rtc/client visual` (narrow include + 33 goldens)

Two coordinated changes:

**A. Narrow the visual coverage `include`** (in
`tests/ui/visual/vitest-browser/vitest-browser.coverage.config.ts`) to
instrument only presentational components (`src/ui/**/*.tsx`), excluding pure
logic/hooks (`csvExport.ts`, `columnSort.ts`, `filterState.ts`, `use*.ts` state
machines, side-effect hooks) that screenshots structurally cannot cover and that
are already covered by the unit/contract tiers. After narrowing, every remaining
uncovered region is a **genuine missing snapshot**, and the tier reaches ~95%+.

**B. Add 33 coverable scenarios** (deterministic states), grouped:

- **Shell (2):** stale-indicator, system-preference theme.
- **FX (10):** tile price DOWN/FLAT, chart down/empty, notional edited/error,
  live-rates price-view toggle, analytics negative-pnl / empty-series /
  flat-positions.
- **FX Blotter (5):** sorted, filtered, no-match-after-filter, filter-popover
  open (date/number/set), row-hover (if the runner captures hover; else drop to
  the excluded list).
- **Credit (13):** new-rfq filled/invalid/instrument-selected/search-open; rfq
  tiles done/expired/cancelled, quote accepted/passed, all-filter, empty;
  sell-side active/responded/empty; workspace new-rfq/sell-side views;
  credit-blotter empty.
- **Admin (1):** admin panel loaded (throughput slider, stubbed fetch).

Each scenario: extend `shared/fixtures.ts` (mutate a base fixture), add a
`shared/scenarios.ts` entry (componentKey + fixtureKey), and where a state needs
an interaction, a `scenarioActions.ts` entry (click/hover/wait/stub).

**Dual goldens:** generate `__screenshots__/react-local/linux-arm64/` locally
via the `:update` scripts and commit them. The canonical CI `__screenshots__/
react/` (x86 fonts) set is generated by the `update-visual-goldens` GitHub
workflow when the branch is pushed/PR'd — it **cannot** be produced in this
aarch64 container. Visual CI stays red until that workflow runs; this is
expected and noted in the plan's handoff.

**Explicitly excluded (non-deterministic, do NOT snapshot):** the timer-driven
RFQ-active tile states — `RfqCountdown` countdown and `TileConfirmation`
post-execution outcomes — and the state-machine hooks (covered in unit/contract
tiers). Interaction-only handlers with no visual arm (`TileExecution`,
`CurrencyFilter`, `QuickFilter`, `RfqFilterTabs` callbacks) are covered by the
contract tier, not here.

## Decomposition (independent phases)

Each tier is an independent phase that produces working, tested software on its
own and can be committed/merged separately:

1. **Phase D** — domain behavioural tests.
2. **Phase S** — server behavioural tests.
3. **Phase A** — client `src/app` behavioural tests + composition exclude.
4. **Phase V** — visual config narrowing + 33 goldens (local set) + docs.

Tier 4 (contract) is a no-op documented in the final report. Phases are ordered
D → S → A → V (cheapest/most-mechanical first; V is the largest and has the CI
golden caveat).

## Non-goals

- No CI threshold gates on any tier (report-only stays report-only).
- No production `src/` edits; no ignore-pragmas.
- No tests for genuinely-defensive / unreachable / non-deterministic code.
- No CI `react/` golden generation in-container (workflow-only).
- No changes to `turbo.json`, the e2e/full-stack tiers, or `@rtc/shared`.

## Success criteria

1. Each of tiers 1, 2, 3, 5 rises to approximately its stated ceiling; tier 4 is
   confirmed already at ceiling and left untouched.
2. Every new test is behavioural (stimulus→observable output); zero pragmas;
   zero production `src/` edits (verified by `git diff` name-only filter).
3. `composition.ts` (app) is excluded from the app coverage denominator with a
   reason comment; the visual coverage `include` is narrowed to presentational
   components with a reason comment.
4. 33 new visual scenarios render and have committed `react-local/<arch>/`
   goldens; the CI `react/` set is queued via the `update-visual-goldens`
   workflow (documented, not done in-container).
5. All affected package suites pass: `@rtc/domain`, `@rtc/server`, `@rtc/client`
   (`test:app:coverage`, `test:ui:contract:coverage`,
   `test:ui:visual:vitest-browser:react:coverage`).
6. A short residual-coverage note documents, per tier, what was deliberately
   left uncovered and why (defensive / bootstrap / non-deterministic).
