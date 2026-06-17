# Visual coverage gaps — snapshot 2026-06-17

One-time inventory of `src/ui` components and conditional branches the **visual**
tier does not render, i.e. that have **no golden snapshot**. Produced by reading
the istanbul report from
`pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage`
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
`pnpm --filter @rtc/client test:ui:visual:vitest-browser:react:coverage` to
refresh the exact figures; the Phase 9 batch lifts the tile execution / RFQ /
stale branches into "covered". The residual gap is now the genuinely
interaction-only handlers and the runtime media-query theme arm (below), which a
static screenshot still cannot pin deterministically — those are covered by the
unit/contract tiers.

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
| `fx/blotter/blotterColumns.ts` | one `formatCellValue` arm unexercised |

> The per-tile React hooks that used to be listed here
> (`useTileState` / `useExecuteTrade` / `useRfqState` / `useRfqQuote` /
> `useStaleDetection` / `useNotional` / `useThroughput`) were removed by the
> "Dumb-UI" refactor — their logic now lives in app-layer machines/presenters
> behind the `AppHooks` seam, tested in the unit/contract tiers and (for the
> render arms) snapshotted by Phase 9.
