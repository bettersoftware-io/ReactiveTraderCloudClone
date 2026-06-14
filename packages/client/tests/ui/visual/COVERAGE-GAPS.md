# Visual coverage gaps — snapshot 2026-06-14

One-time inventory of `src/ui` components and conditional branches the **visual**
tier does not render, i.e. that have **no golden snapshot**. Produced by reading
the istanbul report from
`pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage`
(report: `reports/ui/visual/coverage/index.html`).

**This is a point-in-time snapshot, not a live document.** Writing the scenarios
to close these gaps is deferred follow-up work.

**How to read it:** an uncovered branch is *definitely* unsnapshotted
(false-negative-free). A branch shown as covered was rendered into *some* captured
frame, which does NOT guarantee a dedicated scenario asserts that exact state.

**How to regenerate:** run the command above, then for every file with
`% Funcs` or `% Branch` < 100, list the missing state below.

| File | Gap (function / branch) | Visual state it represents | Suggested scenario name |
|---|---|---|---|
| `fx/liveRates/tile/TileRfq.tsx` | whole file at 0% funcs/branch | RFQ-notional tile body: Initiate-RFQ button, "Awaiting Price…", two-sided quote with countdown, "Quote expired" — none rendered | `tile/rfq-init`, `tile/rfq-requested`, `tile/rfq-received`, `tile/rfq-rejected` |
| `fx/liveRates/tile/RfqCountdown.tsx` | whole file at 0% funcs/branch; both arms of `fraction > 0.3` (primary vs aware colour) | countdown progress bar in normal (blue) and low-time (amber) states | `tile/rfq-received` (full bar) + `tile/rfq-received-expiring` (low-time amber arm) |
| `fx/liveRates/tile/TileConfirmation.tsx` | 12.5% stmts, 3.12% branch; `ConfirmationContent` arms (started / tooLong / timeout / Done / Rejected / Timeout / CreditExceeded) all uncovered | the post-execution confirmation banner in each execution outcome | `tile/confirm-done`, `tile/confirm-rejected`, `tile/confirm-too-long`, `tile/confirm-credit-exceeded` |
| `fx/liveRates/tile/Tile.tsx` | 52% branch; `notional.isRfq` arm, the `!isBusy` gate, and `notionalDisabled` arm uncovered | the RFQ tile layout and the busy/disabled-notional tile (only the plain price tile + loading are snapshotted) | `tile/rfq-init`, `tile/executing` |
| `fx/liveRates/tile/TileChart.tsx` | 33.33% branch; `isUp` false arm + empty-path (`history.length < 2`) arm uncovered | the sparkline drawn red (down trend) and the empty/insufficient-history chart | `tile/chart-down`, `tile/chart-empty` |
| `fx/liveRates/tile/TilePrice.tsx` | 70% branch; `movement` DOWN and NONE colour arms uncovered (only UP rendered) | bid/ask price buttons coloured for a down-tick and for a flat/no-movement tick | `tile/eurusd-down`, `tile/eurusd-flat` |
| `fx/liveRates/tile/TileNotional.tsx` | 37.5% branch; `!notional.isDefault` (reset button) and `notional.error` (inline error) arms uncovered | the notional input showing the reset (↺) button and the validation-error state | `tile/notional-edited`, `tile/notional-error` |
| `fx/liveRates/ViewToggle.tsx` | 33.33% branch; the `mode === "price"` label/title arm uncovered | the view toggle showing its "Chart" label (price-mode), not the default "Price" label | `live-rates/price-view` |
| `fx/liveRates/LiveRatesPanel.tsx` | 83% branch; the stored-view-mode (`localStorage` = price) read arm uncovered | the panel restored into price-view mode from storage | `live-rates/price-view` |
| `fx/blotter/FxBlotter.tsx` | 50% branch; the active-filter-label arm (line 107) and the "No trades match the current filters" empty-after-filter arm (line 167) uncovered | the blotter showing its "Filtered: …" badge, and the no-rows-match-filters empty state | `fx-blotter/filtered`, `fx-blotter/no-match` |
| `fx/blotter/BlotterHeader.tsx` | 33% funcs, 22% branch; `SortIndicator` (▲/▼) and the open `FilterPanel` popover uncovered | header showing a sort arrow and the open per-column filter popover | `fx-blotter/sorted`, `fx-blotter/filter-open` |
| `fx/blotter/BlotterRow.tsx` | 57% funcs; the **hover** background arm (line 29) uncovered — the "new trade" highlight arm (line 27) IS covered | a row in its hover state (interaction-driven; hard to snapshot statically) | `fx-blotter/row-hover` |
| `fx/blotter/columnFilter/DateFilter.tsx` | 0% funcs / 0% branch (whole file) | the date-column filter popover (and its inRange arm) | `fx-blotter/date-filter-open` |
| `fx/blotter/columnFilter/NumberFilter.tsx` | 0% funcs / 0% branch (whole file) | the number-column filter popover (and its inRange arm) | `fx-blotter/number-filter-open` |
| `fx/blotter/columnFilter/SetFilter.tsx` | 0% funcs / 0% branch (whole file) | the set/checkbox-column filter popover | `fx-blotter/set-filter-open` |
| `credit/newRfq/InstrumentSearch.tsx` | 22% funcs, 30% branch; the `selected` summary arm and the open results-dropdown arm uncovered | the instrument typeahead with a selection shown, and with the live results dropdown open | `credit/new-rfq-instrument-selected`, `credit/new-rfq-search-open` |
| `credit/newRfq/DealerSelection.tsx` | 50% funcs, 0% branch; `selectedIds.has` checked/unchecked arms uncovered | the dealer checkbox list with some dealers checked | `credit/new-rfq-dealers-selected` |
| `credit/newRfq/NewRfqForm.tsx` | 57% funcs, 48% branch; validation-error and submit-enabled branches uncovered | the new-RFQ form in its filled/valid and error states (only the empty form is snapshotted) | `credit/new-rfq-filled`, `credit/new-rfq-invalid` |
| `credit/newRfq/QuantityInput.tsx` | 50% branch; the `error` arm uncovered | the quantity field showing its validation error | `credit/new-rfq-invalid` |
| `credit/rfqTiles/RfqCard.tsx` | 29% branch; `stateLabel`/`stateBadgeColor` arms for Closed/Expired/Cancelled and the `canDismiss` dismiss-button arm uncovered | RFQ cards in Done/Expired/Cancelled states with the dismiss control | `credit/rfq-tiles-done`, `credit/rfq-tiles-expired`, `credit/rfq-tiles-cancelled` |
| `credit/rfqTiles/QuoteCard.tsx` | 61% branch; the accepted / passed / rejected `stateColor` + opacity arms uncovered | quote rows coloured for accepted (green tint), passed, and rejected outcomes | `credit/rfq-tiles-accepted`, `credit/rfq-tiles-passed` |
| `credit/rfqTiles/RfqTilesPanel.tsx` | 44% branch; the non-"Live" filter path and empty-after-filter arm uncovered | the panel filtered to a non-Live tab, and the empty-state when no RFQs match | `credit/rfq-tiles-all`, `credit/rfq-tiles-empty` |
| `credit/sellSide/TradeTicket.tsx` | 25% funcs, 25% branch; `isActive` quoting form vs `hasResponded`/`submitted` responded arms; passed / quoted / cancelled / expired status arms uncovered | the sell-side ticket in active (price entry) vs already-responded (passed / quoted / cancelled / expired) states | `credit/sell-side-active`, `credit/sell-side-responded` |
| `credit/sellSide/SellSidePanel.tsx` | 83% branch; the empty arm (`adaptiveBankId === undefined \|\| rfqs.length === 0`) uncovered | the "No RFQs for Adaptive Bank" empty state | `credit/sell-side-empty` |
| `credit/CreditWorkspace.tsx` | 50% funcs; the `new-rfq` and `sell-side` view arms uncovered (only `tiles` rendered) | the workspace with the New-RFQ and Sell-Side sub-views active | `credit/workspace-new-rfq`, `credit/workspace-sell-side` |
| `credit/blotter/CreditBlotter.tsx` | 71% branch; the empty-state and non-default row-state arms uncovered | the credit blotter empty, and rows in their various terminal states | `credit/blotter-empty` |
| `fx/analytics/AnalyticsPanel.tsx` | 75% branch (line 32); the empty/no-position arm uncovered | the analytics panel with no open positions | `analytics/empty` |
| `fx/analytics/PnlValue.tsx` | 50% branch; the negative-value arm uncovered (only positive P&L rendered) | a P&L figure styled negative (red, "-" prefix) | `analytics/negative-pnl` |
| `fx/analytics/PnlChart.tsx` | 68% branch | the negative-line colour arm (line 73) and the `< 2`-point empty/insufficient-series arms (lines 12, 33, 47) | `analytics/negative-pnl`, `analytics/pnl-empty` |
| `fx/analytics/PairPnlBars.tsx` | 80% branch | the `formatPnl` ≥1m / ≥1k magnitude-abbreviation arms (lines 9–10) — the +/- bar-colour arms are covered | `analytics/large-pnl` |
| `fx/analytics/PositionBubbles.tsx` | 87% branch (line 14) | the `maxAbsPnl === 0` degenerate arm (all-flat positions → min-radius bubbles) — the +/- sign arms are covered | `analytics/flat-positions` |
| `fx/admin/AdminPanel.tsx` (`admin/AdminPanel.tsx`) | 33% funcs, 27% branch; the loaded (slider) body uncovered — only the `loading` arm captured by the stubbed `app/admin` scenario | the throughput slider in its loaded state | `app/admin-loaded` |
| `shell/stale/StaleIndicator.tsx` | 75% branch; the `stale` overlay arm uncovered | a tile with the "Reconnecting…" stale overlay shown | `tile/stale` |
| `shell/theme/ThemeProvider.tsx` | 70% branch (lines 49–68); the non-default / system-preference theme arms uncovered | the provider resolving to the non-seeded theme path | (provider logic — see note) |

## Interaction handlers not exercised by the visual tier

These components are **fully branch-covered** (every visual arm `BRH == BRF`),
so they have **no missing snapshot**. Their only gap is an uncovered event
**handler** (a `< 100% funcs` figure). A static visual snapshot can't capture a
click/change/hover callback, so these get **no visual scenario** — drive the
handler from the unit/contract tier instead.

| File | Coverage | Uncovered handler |
|---|---|---|
| `fx/liveRates/tile/TileExecution.tsx` | 100% branch, 33% funcs | the buy/sell `onClick` handlers (both arms of the `disabled` styling are already rendered) |
| `fx/liveRates/CurrencyFilter.tsx` | 100% branch, 66% funcs | the category-tab `onChange` handler (the `selected === cat` highlight arm is already rendered) |
| `fx/blotter/QuickFilter.tsx` | no branches, 50% funcs | the input `onChange` handler (component has no conditional rendering) |
| `credit/rfqTiles/RfqFilterTabs.tsx` | 100% branch, 66% funcs | the tab `onChange` handler (the `selected === f` highlight arm is rendered for the selected tab) |

## Utility logic not exercised by the visual tier

These are pure logic / data files, not rendered components. Their uncovered
lines are **code the visual tier doesn't drive**, not *missing snapshots* — a
util branch has no "visual state", so they get no scenario name. Listed for
completeness; cover them in the unit/contract tiers instead.

| File | Coverage | Note |
|---|---|---|
| `fx/blotter/csvExport.ts` | 0% / 0% | CSV export (Blob/anchor click) — never invoked by a snapshot |
| `fx/blotter/columnSort.ts` | 13% / 10% | sort-direction cycling + comparator logic |
| `fx/blotter/columnFilter/filterState.ts` | 9% / 5% | filter predicate construction/application |
| `fx/blotter/blotterColumns.ts` | 100% funcs / 85% branch (line 32) | one `formatCellValue` arm unexercised |
| `admin/hooks/useThroughput.ts` | 60% funcs / 31% branch | fetch/poll hook — stubbed away in the visual `app/admin` scenario |
| `fx/liveRates/tile/hooks/useNotional.ts` | 60% funcs / 0% branch | notional parse/validate hook |
| `fx/liveRates/tile/hooks/useTileState.ts` | 25% funcs / 25% branch | execution state machine |
| `fx/liveRates/tile/hooks/useRfqState.ts` | 25% funcs / 14% branch | RFQ state machine |
| `fx/liveRates/tile/hooks/useExecuteTrade.ts` | 50% funcs | trade-execution side effect |
| `fx/liveRates/tile/hooks/useRfqQuote.ts` | 50% funcs | RFQ quote request side effect |
| `shell/stale/useStaleDetection.ts` | 100% funcs / 50% branch | staleness timer logic (drives the `StaleIndicator` overlay above) |
