# Visual coverage gaps — snapshot 2026-06-16

One-time inventory of `src/ui` components and conditional branches the **visual**
tier does not render, i.e. that have **no golden snapshot**. Produced by reading
the istanbul report from
`pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage`
(report: `reports/ui/visual/coverage/index.html`).

**This is a point-in-time snapshot, not a live document.** It was refreshed after
the Phase V deterministic golden batch (21 scenarios) landed; the remaining rows
are either testid-gated interaction states (need a production `data-testid` edit,
out of scope for visual goldens) or non-deterministic timer/transition states.

**How to read it:** an uncovered branch is *definitely* unsnapshotted
(false-negative-free). A branch shown as covered was rendered into *some* captured
frame, which does NOT guarantee a dedicated scenario asserts that exact state.

**Denominator:** the coverage config (`vitest-browser.coverage.config.ts`) was
narrowed in Phase V to `src/ui/**/*.tsx` only — the presentational layer. Pure
`.ts` logic/hook files (sort/filter/CSV/state-machine hooks) are covered by the
unit/contract tiers, not here; see the "Utility logic" table below for the list.

Current headline (2026-06-16, `src/ui/**/*.tsx`):
**71.6% stmts / 64.17% branch / 61.17% funcs / 73.72% lines.** The residual gap
is dominated by the testid-gated set below, each of which needs a production
`src/` edit (a `data-testid` on an unlabelled control) that the visual-golden
policy forbids — those states are covered by the sociable contract tier instead.

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

## Residual — deliberately unsnapshotted

### Testid-gated interaction states (covered by the contract tier)

Reachable only by clicking/typing into a control that has **no `data-testid`**.
The runner-neutral `scenarioActions` table keys on testids; adding one is a
production `src/` edit the visual-golden policy forbids. The sociable contract
tier (`tests/ui/contract/`) drives these handlers directly, so the behaviour is
covered — only the *pixel* is not. (Authorizing testid-only additions could lift
these into goldens in a follow-up; see the plan's "Open decision".)

| File | Uncovered visual state | Covered by |
|---|---|---|
| `fx/blotter/BlotterHeader.tsx` | sort arrow (▲/▼) + open per-column filter popover | contract tier |
| `fx/blotter/FxBlotter.tsx` | active-filter "Filtered: …" badge + no-rows-match empty arm | contract tier |
| `fx/blotter/columnFilter/DateFilter.tsx` | date-column filter popover (inRange arm) | contract tier |
| `fx/blotter/columnFilter/NumberFilter.tsx` | number-column filter popover (inRange arm) | contract tier |
| `fx/blotter/columnFilter/SetFilter.tsx` | set/checkbox-column filter popover | contract tier |
| `fx/blotter/QuickFilter.tsx` | input `onChange` handler | contract tier |
| `credit/rfqTiles/RfqTilesPanel.tsx` | non-"Live" / "All" filter tab path | contract tier |
| `credit/rfqTiles/RfqFilterTabs.tsx` | tab `onChange` handler | contract tier |
| `credit/newRfq/NewRfqForm.tsx` | filled/valid + validation-error form states | contract tier |
| `credit/newRfq/InstrumentSearch.tsx` | selected summary + open results dropdown | contract tier |
| `credit/newRfq/DealerSelection.tsx` | dealer checkbox checked/unchecked arms | contract tier |
| `credit/newRfq/QuantityInput.tsx` | quantity validation-error arm | contract tier |
| `fx/liveRates/tile/TileExecution.tsx` | buy/sell `onClick` handlers | contract tier |
| `fx/liveRates/tile/TileNotional.tsx` | reset (↺) button + inline-error arms | contract tier |
| `fx/liveRates/CurrencyFilter.tsx` | category-tab `onChange` handler | contract tier |

### Timer / transition / runtime-only states (non-deterministic)

These render only after a timer fires, a transition completes, or a hover/
runtime preference resolves — a static screenshot can't pin them deterministically.

| File | Uncovered visual state | Why no golden |
|---|---|---|
| `fx/liveRates/tile/TileRfq.tsx` | Initiate-RFQ / awaiting / received / expired tile body | timer + execution-state-machine driven |
| `fx/liveRates/tile/RfqCountdown.tsx` | countdown bar (normal + low-time amber) | timer-driven |
| `fx/liveRates/tile/TileConfirmation.tsx` | post-execution confirmation banner (each outcome) | execution-state-machine driven |
| `fx/liveRates/tile/Tile.tsx` | RFQ-notional layout + busy/disabled-notional arms | RFQ/execution state machine |
| `fx/blotter/BlotterRow.tsx` | row hover-background arm | hover-only (interaction, not a static state) |
| `shell/stale/StaleIndicator.tsx` | "Reconnecting…" stale overlay arm | staleness-timer driven |
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
| `fx/blotter/blotterColumns.ts` | one `formatCellValue` arm unexercised |
| `admin/hooks/useThroughput.ts` | fetch/poll hook — stubbed away in the visual admin scenario |
| `fx/liveRates/tile/hooks/useNotional.ts` | notional parse/validate hook |
| `fx/liveRates/tile/hooks/useTileState.ts` | execution state machine |
| `fx/liveRates/tile/hooks/useRfqState.ts` | RFQ state machine |
| `fx/liveRates/tile/hooks/useExecuteTrade.ts` | trade-execution side effect |
| `fx/liveRates/tile/hooks/useRfqQuote.ts` | RFQ quote request side effect |
| `shell/stale/useStaleDetection.ts` | staleness timer logic |
