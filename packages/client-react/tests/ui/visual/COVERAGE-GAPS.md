# Visual coverage gaps — snapshot 2026-06-17

One-time inventory of `src/ui` components and conditional branches the **visual**
tier does not render, i.e. that have **no golden snapshot**. Produced by reading
the istanbul report from
`pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:coverage`
(report: `reports/ui/visual/coverage/index.html`).

**This is a point-in-time snapshot, not a live document.** It was refreshed after
the Phase V deterministic golden batch (21 scenarios) plus the testid-gated
interaction batch (11 scenarios) landed. The remaining rows are non-deterministic
timer/transition states. The blotter sort/filter, RFQ "All" filter, and new-RFQ
form states are now snapshotted — the user authorized **`data-testid`-only**
production additions (no logic/markup changes) so the runner-neutral
`scenarioActions` table can drive them.

**How to read it:** an uncovered branch is *definitely* unsnapshotted
(false-negative-free). A branch shown as covered was rendered into *some* captured
frame, which does NOT guarantee a dedicated scenario asserts that exact state.

**Denominator:** the coverage config (`vitest-browser.coverage.config.ts`) was
narrowed in Phase V to `src/ui/**/*.tsx` only — the presentational layer. Pure
`.ts` logic/hook files (sort/filter/CSV/state-machine hooks) are covered by the
unit/contract tiers, not here; see the "Utility logic" table below for the list.

**Phase 9 update (2026-06-17):** the four formerly timer-driven tile components
(`RfqCountdown`, `TileConfirmation`, `TileRfq`, `StaleIndicator`) are now
snapshotted — their app-layer machine state is injectable per-symbol through the
seam (`data.tileExecution` / `data.rfqTile` / `data.stale` records), so each
transient state is a deterministic static shot. They were un-excluded from the
coverage denominator (`vitest-browser.coverage.config.ts`) and now carry goldens.

Current headline (2026-06-17, `src/ui/**/*.tsx`): re-run
`pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:coverage` to
refresh the exact figures; the Phase 9 batch lifts the tile execution / RFQ /
stale branches into "covered". The residual gap is now the genuinely
interaction-only handlers and the runtime media-query theme arm (below), which a
static screenshot still cannot pin deterministically — those are covered by the
unit/contract tiers.

## Phase 10 (final) — Dumb-UI gates + whole-workstream verification (2026-06-18)

**Architecture gates 26–29 added and GREEN.** `tests/scripts/grep-gates.ts`
now ENFORCES the Dumb-UI rules against production `src/ui` (the
`src/ui/hooks/` bridge dir and `*.test.`/`*.spec.` files are exempt):

- **26** — no `rxjs` / `@react-rxjs` / `@rx-state` import in `src/ui` (bridge only).
- **27** — no `localStorage` in `src/ui` (persistence lives in app-layer ports).
- **28** — no `fetch(` / `import.meta.env` in `src/ui` (transport/config app-layer).
- **29** — the ONLY `setTimeout`/`setInterval` permitted in `src/ui` is the
  transient row-highlight in `fx/blotter/BlotterRow.tsx` (customCheck).

All 29 gates pass. The 4 un-excluded components (`RfqCountdown`,
`TileConfirmation`, `TileRfq`, `StaleIndicator`) plus `Tile.tsx`,
`AnalyticsPanel.tsx`, `AdminPanel.tsx` carry **no** rxjs / timer / localStorage /
fetch / env reference and no import of a deleted hook — the seam-method calls
(`useNotional`, `useThroughput`, etc.) are app-layer-backed and allowed.

**Visual `src/ui/**/*.tsx` coverage after Phase 9:** 83.7 % stmts / 77.17 %
branch / 77.08 % funcs / 85.41 % lines (up from ~52 % pre-refactor) — the Phase 9
tile/RFQ/stale goldens did the lifting; the residual gap is the interaction-only
handlers + runtime media-query theme arm tabulated below.

**App / domain / server coverage (machines + presenters + port contracts):**
domain 95.93 % stmts / 96.42 % lines (169 tests); server 90.04 % / 98.94 %
(54 tests); client app 90.85 % / 95.02 % (158 tests); contract tier 246 tests
green. The AdminPort / PreferencesPort contracts and the execution/RFQ/throughput
machines sit at ~100 % where applicable.

## Behaviour-sync coverage pass (2026-06-25)

**Coverage gaps across all tiers closed** after the behaviour-sync followup pass
(`feat/behaviour-sync-followups` branch). Each tier was audited against the
post-behaviour-sync codebase; intentionally-open gaps are documented below.

### Headline numbers after the pass

| Tier | Metric | Before | After | Δ |
|------|--------|--------|-------|---|
| Domain (v8) | Branch | 86.88% | **88.52%** | +1.64pp |
| Server `ws/wsHandler.ts` (v8) | Branch | 71.18% | **72.88%** | +1.70pp |
| Client app layer (v8) | Lines | 99.04% | **100%** | +0.96pp |
| Client app layer (v8) | Branch | 80.97% | **83.9%** | +2.93pp |
| Contract tier (v8) | Functions | 99.41% | **100%** | +0.59pp |
| Visual tier (istanbul) | Statements | 80.24% | **82.53%** | +2.29pp |
| Visual tier (istanbul) | Branches | 77.96% | **79.38%** | +1.42pp |
| Visual tier (istanbul) | Functions | 75.00% | **78.06%** | +3.06pp |
| Visual tier (istanbul) | Lines | 81.73% | **83.76%** | +2.03pp |

### Domain — intentionally-open gaps (2026-06-25)

| File | Lines | Reason |
|------|-------|--------|
| `analytics/aggregatePositions.ts` lines 52-53,58 | `if (span === 0) return POSITION_MIN_RADIUS` | `span` = `maxValue - minValue`. With non-empty data and all magnitudes > 0 after filtering zeros, `minValue` is either `rawMin` (< maxValue → span > 0) or `0` (when rawMin === maxValue → span = maxValue > 0). `span===0` with non-empty data is structurally impossible through the public API. |
| `simulators/CreditRfqSimulator.ts` lines 98,144 | Invariant throw + error catch | Line 98: defensive `throw` that fires only if `rfqQuotes.get(rfqId)` returns undefined immediately after `.set(rfqId, [])` — impossible under single-threaded JS. Line 144: `catch (e)` in a `setTimeout` callback around `applyQuote()` which has no throwing code paths. |
| `simulators/AnalyticsSimulator.ts` line 81 | `if (history.length > HISTORY_SIZE)` false branch | History is initialized at exactly `HISTORY_SIZE` items. The first push makes it `HISTORY_SIZE+1` and `shift()` always fires — the false arm (history NOT yet at cap) is never hit. |
| `simulators/PricingSimulator.ts` line 111 | `if (> PRICE_HISTORY_SIZE)` false branch | Same pattern — history starts at exactly `PRICE_HISTORY_SIZE`; the first live tick pushes to `+1` and `shift()` always fires. |

### Server — intentionally-open gaps (2026-06-25)

| File | Lines | Reason |
|------|-------|--------|
| `ws/wsHandler.ts` 253-260, 303-310, 349-356 | Abort listeners for `streamPricing`, `streamBlotter`, `streamAnalytics` | Same pattern as the two now-covered abort tests (instruments + workflow). These streams complete synchronously in the default `fakeServices()`. Covering them requires per-stream interval-based fakes; gap severity does not warrant the fixture complexity. |
| `ws/wsHandler.ts` 461-462 | Abort listener for `streamDealers` | Same rationale as the three above. |

### Client app layer — intentionally-open gaps (2026-06-25)

| File | Lines | Reason |
|------|-------|--------|
| `adapters/WsAdapter.ts` lines 64, 87-97 | `connect()` disposed-guard; `pendingRpcs.get()` truthy-guard | Single-threaded JS invariants: `dispose()` clears the reconnect timer so the callback never runs; `pendingRpcs.get()` after `.has()` is always non-null. |
| `adapters/WsAdapter.ts` lines 130-139 | Timer callback `if (this.disposed) return` | `dispose()` calls `clearTimeout(this.reconnectTimer)` so the callback is never invoked after dispose. Defensive dead code in single-threaded JS. |
| `adapters/BrowserConnectionEventsAdapter.ts` line 56 | `if (idleTimer) clearTimeout(idleTimer)` false branch | `armIdleTimer()` is called unconditionally at subscription, so `idleTimer` is always non-null at teardown. |
| `adapters/portFactory.ts` lines 616, 629-648, 658 | `if (cancelled) return` arm; `catch (e)` arms in `getThroughput`/`setThroughput` | The `cancelled = true` teardown fires on unsubscribe. In tests, the subscription is never cancelled mid-flight. The `catch` arms require `ws.rpc()` to reject — covered in `.errors.test.ts` files for other ports; duplicating for getThroughput/setThroughput adds setup complexity without new behavioural insight. |
| `presenters/RfqsPresenter.ts` line 68 | `if (a === b) return true` in `shallowArrayEquals` | `Array.from()` always returns a new reference, so reference equality through `distinctUntilChanged(shallowArrayEquals)` is never true in practice. |

### Contract tier — intentionally-open gaps (2026-06-25)

| File | Lines | Reason |
|------|-------|--------|
| `ui/fx/blotter/FxBlotter.tsx` line 63 | `if (col)` false branch in `activeFilterLabels` loop | Defensive dead code: `filters.keys()` yields only `keyof Trade` values and every `Trade` key has a matching `COLUMNS` entry. The false branch (unknown key) is type-impossible. |
| `ui/fx/blotter/columnFilter/filterState.ts` line 87 | `return true` fallthrough | TypeScript-exhaustive: `ColumnFilter` is a discriminated union with three types (`set`/`number`/`date`). The fallthrough only fires for a value outside the union, which the type system prevents. |
| `ui/fx/liveRates/tile/TileRfq.tsx` line 45 | `if (!quote) return` after `rfqState.accept()` | The button renders only when `state.status === "received" && state.quote` (line 87). `quote` is captured before `accept()`. Structurally unreachable while `state.quote` is non-null at render. |
| `ui/fx/liveRates/tile/TileConfirmation.tsx` line 102 | `default: return "unknown"` in switch | Exhaustive switch over `ExecutionStatus` — all enum members handled above. Defensive fallthrough for future enum additions. |
| `ui/shell/connection/useHooks.ts` line 11 | `throw new Error(...)` | Only fires when `useContext(HooksContext)` returns null — outside `HooksProvider`. All contract tests mount within the provider. |
| `ui/shell/theme/useTheme.ts` line 7 | `throw new Error(...)` | Same: defensive provider-missing guard; always wrapped in `ThemeProvider` in tests. |
| `ui/fx/analytics/PositionBubbles.tsx`, `ui/fx/analytics/PairPnlBars.tsx` | entire files | Excluded from contract tier scope (`coverage.exclude` in `vitest.config.ts`). D3/canvas render paths with no DOM-assertable logic — owned by the visual tier. |

### Visual tier — intentionally-open gaps (2026-06-25)

These gaps were confirmed still open after the 2026-06-25 pass added five new
scenarios (`credit/blotter-sorted`, `credit/blotter-filtered`,
`credit/blotter-quick-filter`, `credit/rfq-tiles-filter-done`,
`credit/rfq-countdown-zero`).

| File | Lines | Reason |
|------|-------|--------|
| `ui/fx/analytics/PositionBubbles.tsx` lines 90-93, 118-132 | D3 `onMove` drag handler + `exit`/`update` join callbacks | Drag requires a synthetic D3 drag event sequence (start/drag/end); `update`/`exit` callbacks require re-renders with changed `nodesRef.current`. Neither is achievable via `ScenarioStep` (click/type/select). |
| `ui/fx/analytics/PairPnlBars.tsx` lines 56-59 | `hoveredSymbol === pos.symbol` hover branch | Requires a `hover` step type not present in `scenarioActions.ts`. Deferred. |
| `ui/credit/newRfq/SetFilter.tsx` lines 35-47, 60 | `toggleValue` + `handleApply` subset arm | Checkboxes have no `data-testid`; individual values cannot be targeted by `click` step. Production code not modified (task constraint). |
| `ui/credit/rfqTiles/RfqCard.tsx` line 63 | `handleDismiss` body | Dismiss `✕` button has no `data-testid`. Same constraint as SetFilter. |
| `ui/credit/rfqTiles/RfqTilesPanel.tsx` lines 80-85 | `handleDismiss` + `handleAccept` | Dismiss and Accept buttons in QuoteCard have no testids. Production code unchanged. |
| `ui/fx/liveRates/tile/TileExecution.tsx` lines 23-35 | Sell/Buy onClick arrow functions | Clicking triggers the execution flow → visual becomes "Executing…" overlay, already pinned by `tile/execution-started`. Click path produces no new visually distinct golden. |
| `ui/fx/liveRates/tile/TileNotional.tsx` lines 25-35 | handleChange/handleKeyDown/handleFocus | Interaction handlers for the notional input. Result is the same tile-with-changed-notional view — already covered by static scenarios. No new visual branch pinned. |
| `ui/fx/liveRates/tile/TileRfq.tsx` lines 43-57, 94-103 | `handleAccept` body, Sell button onClick | Click interactions that trigger execution flow — already pinned via `tile/rfq-received`; clicking navigates away from received state into execution. |
| `ui/shell/admin/AdminPanel.tsx` lines 26-42 | slider onChange + number input onChange validation | No `data-testid` on slider or number input. Cannot target via `click`/`type` steps. |
| `ui/credit/CreditWorkspace.tsx` line 17 | Router switch `default` fallback | Defensive fallthrough after all tabs handled. TypeScript-exhaustive. |
| `ui/credit/newRfq/DealerSelection.tsx` lines 19-22, 36 | Checkbox onChange + deselect-all guard | No testids on individual dealer checkboxes. Same testid constraint. |
| `ui/credit/newRfq/InstrumentSearch.tsx` lines 51-52 | "Change" button handler | No scenario seeds a pre-selected instrument. Clicking "Change" would produce the same empty-search view as the initial state — no new visual branch. |
| `ui/credit/newRfq/NewRfqForm.tsx` lines 60-61 | `handleSubmit` `if (!canSubmit)` guard + `submit()` call | The fake `submit` is a noop. Clicking the enabled Submit button calls `noop()` — visual output stays identical to `credit/new-rfq-filled`. |
| `ui/fx/blotter/FxBlotter.tsx` lines 49, 82 | `else next.delete(column)` (filter clear) + `exportFxToCsv` onClick | Line 49 requires applying a filter then removing it (two-step interaction beyond current single-action schemes). Line 82 triggers a CSV download — no visual state change. |
| `ui/fx/blotter/BlotterHeader.tsx` line 121 | `setOpenFilter(…null)` arm | Requires double-clicking the same filter toggle (open then close without applying). Not a visually distinct state from the closed toggle. |
| `ui/fx/liveRates/tile/TileConfirmation.tsx` line 72 | `return null` from `ConfirmationContent` | Fires when `state.status === "finished"` and `executionStatus === Done` but `trade` is undefined. Fixture always provides a trade when status is Done. A `trade`-less Done execution is not a valid production state. |
| `ui/fx/liveRates/tile/TileConfirmation.tsx` line 102 | `default: return "unknown"` in `statusKey` | TypeScript-exhaustive switch over `ExecutionStatus`. Defensive fallthrough for future enum additions. |
| `ui/fx/liveRates/CurrencyFilter.tsx` line 26 | `onChange` onClick | Requires clicking a non-default filter category. All three categories render identical tiles in the populated fixture. Deferred. |
| `ui/fx/liveRates/ViewToggle.tsx` line 18 | `onChange` onClick | Clicking changes `viewMode`, but the resulting state is already pinned by `live-rates/price-view` (seeded through PreferencesPort seam). No additional visual branch. |

**Dead seam command hooks (for a HUMAN pruning decision — NOT removed):** of the
7 command hooks on `AppHooks`, only **`useAcceptQuote`** still has a `src/ui`
component caller (`credit/rfqTiles/RfqTilesPanel.tsx`). The other six —
**`useExecuteTrade`, `useCreateRfq`, `useCancelRfq`, `usePassQuote`,
`useQuoteRfq`, `useRequestRfqQuote`** — are **dead**: present only in the
`AppHooks` interface + `createAppHooks` impl + the two test fakes
(`tests/ui/contract/react/hooksFromWorld.ts`,
`tests/ui/visual/react/buildFakeHooks.ts`), with no component consumer. Earlier
phases (esp. 8) routed those commands through machines, leaving the seam methods
orphaned. Pruning requires deleting each from the interface, the impl, and both
fakes together.

**Two expected reds:**

1. **Visual `react/` (x86 CI) goldens lag** until the `update-visual-goldens`
   workflow regenerates them on x86 — the local `react-local/<arch>/` set is the
   one validated here; both sets are the framework-portability contract.
2. **Cypress e2e is CI-only on aarch64** — the bundled-Electron message pump
   busy-spins at 100 % CPU in this container (headless too), so the two Cypress
   suites only pass on x86 CI. The Playwright e2e suites run locally.

**Found concern (pre-existing, NOT a Phase-10 regression):** 9 of 48 Playwright
**browser** e2e tests fail locally — the `fxTrading` confirmation-overlay,
`fxRfq`, and multi-trade `blotter` flows. The trade itself executes (the
"executed trade appears in the blotter" test passes), but the transient
`trade-confirmation` overlay isn't observed within the 5 s window (architecture
auto-dismiss is 5 s; e2e runs in **simulator** mode per STATUS.md item 4). The
failure **reproduces on pristine HEAD with the gate change stashed**, so it is
independent of Phase 10 (a test-only gate edit has zero runtime effect). The same
flows are covered deterministically and green by the contract (246) and visual
tiers, which exercise `TileConfirmation` directly. Left for a separate fix per
the Phase-10 rule not to edit production `src` speculatively to chase e2e.

## Closed by the Phase V deterministic batch

The following gaps from the 2026-06-14 snapshot now have a dedicated golden and
are no longer listed:

- `TilePrice.tsx` DOWN/NONE colour arms → `tile/eurusd-down`, `tile/eurusd-flat`
- `TileChart.tsx` down-trend + empty-path arms → `tile/chart-down`, `tile/chart-empty`
- `ViewToggle.tsx` / `LiveRatesPanel.tsx` price-mode arm → `live-rates/price-view`
- `AnalyticsPanel.tsx` empty arm + `PnlValue`/`PnlChart` negative arms → `analytics/negative-pnl`, `analytics/empty`
- `PositionBubbles.tsx` all-flat degenerate arm → `analytics/flat-positions`
- `RfqCard.tsx` Done/Expired/Cancelled badge + dismiss arms → `credit/rfq-tiles-{done,expired,cancelled}`
- `QuoteCard.tsx` accepted/passed/rejected colour arms → `credit/rfq-tiles-{accepted,passed}`
- `RfqTilesPanel.tsx` empty-after-filter arm → `credit/rfq-tiles-empty`
- `TradeTicket.tsx` active vs responded arms → `credit/sell-side-{active,responded}`
- `SellSidePanel.tsx` empty arm → `credit/sell-side-empty`
- `CreditBlotter.tsx` empty arm → `credit/blotter-empty`
- `CreditWorkspace.tsx` new-rfq / sell-side view arms → `credit/workspace-{new-rfq,sell-side}`
- `AdminPanel.tsx` loaded slider arm → `admin/panel-loaded`

## Closed by the testid-gated interaction batch (2026-06-16)

These were previously listed as testid-gated residual. With the user's
authorization of **`data-testid`-only** production additions (pure attribute
additions, no logic/markup change), the runner-neutral `scenarioActions` table
now drives them and each has a dedicated golden across all three runners:

- `fx/blotter/BlotterHeader.tsx` sort + filter-toggle → `fx-blotter/sorted`, `fx-blotter/filter-{date,number,set}`
- `fx/blotter/FxBlotter.tsx` "Filtered: …" badge + no-rows-match empty arm → `fx-blotter/filtered`, `fx-blotter/no-match`
- `fx/blotter/columnFilter/{Date,Number,Set}Filter.tsx` popover render → `fx-blotter/filter-{date,number,set}` (+ NumberFilter apply via `fx-blotter/filtered`/`no-match`)
- `credit/rfqTiles/RfqFilterTabs.tsx` + `RfqTilesPanel.tsx` "All" filter tab → `credit/rfq-tiles-all`
- `credit/newRfq/InstrumentSearch.tsx` open-results dropdown + selected summary → `credit/new-rfq-search-open`, `credit/new-rfq-instrument-selected`
- `credit/newRfq/NewRfqForm.tsx` + `QuantityInput.tsx` filled/valid + validation-error → `credit/new-rfq-filled`, `credit/new-rfq-invalid`

## Closed by Phase 9 (2026-06-17)

The tile execution / RFQ / staleness states were previously listed below as
timer/transition-driven and **excluded** from the coverage denominator. Earlier
"Dumb-UI" phases relocated that logic into app-layer machines exposed through the
`AppHooks` seam, so the state is now **injectable per-symbol** (static, no live
timers) and each arm has a dedicated golden across all three runners:

- `fx/liveRates/tile/TileConfirmation.tsx` — every execution-outcome banner →
  `tile/execution-{started,too-long,timeout,done,rejected,credit-exceeded,finished-timeout}`
- `fx/liveRates/tile/TileRfq.tsx` — Initiate / awaiting / received / expired tile
  body → `tile/rfq-{requested,received,rejected}`
- `fx/liveRates/tile/RfqCountdown.tsx` — countdown bar, green (fraction > 0.3) **and**
  amber low-time (fraction ≤ 0.3) arms → `tile/rfq-received` (7000ms) / `tile/rfq-received-low` (2000ms)
- `fx/liveRates/tile/Tile.tsx` — RFQ-notional layout + busy/disabled-notional arms
  (exercised by the execution and RFQ scenarios above)
- `shell/stale/StaleIndicator.tsx` — "Reconnecting…" stale overlay → `tile/stale`

## Residual — deliberately unsnapshotted

### Still testid-gated / interaction-only (covered by the contract tier)

Reachable only by clicking/typing into a control with **no `data-testid`** that
was out of this batch's scope. The sociable contract tier (`tests/ui/contract/`)
drives these handlers directly, so the behaviour is covered — only the *pixel* is
not. (A future testid-only batch could lift these into goldens.)

| File | Uncovered visual state | Covered by |
|---|---|---|
| `fx/blotter/columnFilter/{Date,Number}Filter.tsx` | `inRange` two-input arm + Reset path | contract tier |
| `fx/blotter/columnFilter/SetFilter.tsx` | checkbox toggle + apply (subset) arm | contract tier |
| `fx/blotter/QuickFilter.tsx` | input `onChange` handler | contract tier |
| `credit/newRfq/DealerSelection.tsx` | dealer checkbox checked/unchecked toggle arms | contract tier |
| `credit/newRfq/NewRfqForm.tsx` | submit/confirmation success arm (timer + RPC) | contract tier |
| `fx/liveRates/tile/TileExecution.tsx` | buy/sell `onClick` handlers | contract tier |
| `fx/liveRates/tile/TileNotional.tsx` | reset (↺) button + inline-error arms | contract tier |
| `fx/liveRates/CurrencyFilter.tsx` | category-tab `onChange` handler | contract tier |

### Timer / transition / runtime-only states (non-deterministic)

These render only after a timer fires, a transition completes, or a hover/
runtime preference resolves — a static screenshot can't pin them deterministically.

(The tile execution / RFQ / countdown / staleness states that used to sit here
were closed by Phase 9 — see "Closed by Phase 9" above. Their state is now
injected statically through the seam, so they are deterministic goldens.)

| File | Uncovered visual state | Why no golden |
|---|---|---|
| `fx/blotter/BlotterRow.tsx` | row hover-background arm | hover-only (interaction, not a static state) |
| `shell/theme/ThemeProvider.tsx` | non-default / system-preference theme arms | `system-preference` theme unimplemented; runtime media-query |

## Utility logic not exercised by the visual tier

Pure logic / data / hook files (now excluded from the visual denominator — the
config includes `*.tsx` only). Their uncovered lines are **code the visual tier
doesn't drive**, not *missing snapshots*. Cover them in the unit/contract tiers.

| File | Note |
|---|---|
| `fx/blotter/csvExport.ts` | CSV export (Blob/anchor click) — never invoked by a snapshot |
| `fx/blotter/columnSort.ts` | sort-direction cycling + comparator logic |
| `fx/blotter/columnFilter/filterState.ts` | filter predicate construction/application |
| `fx/blotter/blotterColumns.ts` | `formatFxCell` fully covered by contract tier (all arms exercised — function renamed in Task 3; no gap) |

> The per-tile React hooks that used to be listed here
> (`useTileState` / `useExecuteTrade` / `useRfqState` / `useRfqQuote` /
> `useStaleDetection` / `useNotional` / `useThroughput`) were removed by the
> "Dumb-UI" refactor — their logic now lives in app-layer machines/presenters
> behind the `AppHooks` seam, tested in the unit/contract tiers and (for the
> render arms) snapshotted by Phase 9.
