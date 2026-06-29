# Task 9 Report — Visual Goldens (Equities, local linux-arm64)

## What was done

### Deterministic fakes wired (`tests/ui/visual/react/buildFakeHooks.ts`)
Replaced all 7 no-op equities stubs with data-reading implementations:
`useWatchlist`, `useEquityQuote`, `useCandles`, `useDepth`, `useEquityOrders`,
`useEquityPositions`, `useOrderTicket`. All read from the fixture `AppData` object;
no live simulators or RxJS streams involved.

### AppData extended (`tests/ui/visual/shared/appData.ts`)
Added 7 equities fields to the `AppData` interface:
`equityWatchlist`, `equityQuotes`, `equityCandles`, `equityDepth`,
`equityOrders`, `equityPositions`, `equityOrderTicket`.

### Fixtures added (`tests/ui/visual/shared/fixtures.ts`)
Three new fixture entries via post-object index assignment (forward-ref constraint):
- `equities-loaded` — 6 instruments (AAPL/MSFT/NVDA/JPM/GS/XOM), fixed per-symbol
  quotes with varied changePct (−2.67 … +7.21), 40 hand-crafted AAPL candles
  (~165→180), 8+8 AAPL depth levels, 5 orders (filled/working/partiallyFilled/
  rejected/new), 4 positions (two positive, one negative, one small positive).
- `equities-ticket-editing` — adds `OrderTicketState { phase: "editing", qty: 100 }`.
- `equities-ticket-filled` — adds `OrderTicketState { phase: "filled", filledQty: 100,
  avgPrice: 178.5 }`.

### Scenarios registered (`tests/ui/visual/shared/scenarios.ts`)
9 new scenarios in the `equities/*` and `app/*` namespaces:
`equities/watchlist-loaded`, `equities/sector-heatmap`, `equities/chart-loaded`,
`equities/depth-ladder`, `equities/ticket-editing`, `equities/ticket-filled`,
`equities/positions-with-pnl`, `equities/panel`, `app/equities`.

### Registry entries added (`tests/ui/visual/react/registry.tsx`)
7 equities component entries, each with a fixed-size wrapper for x86 stability:
- `EquitiesWatchlist`: `width: 280`
- `EquitiesSectorHeatmap`: `width: 280`
- `EquitiesPriceChart`: `width: 400, height: 200`
- `EquitiesDepthLadder`: `width: 260`
- `EquitiesOrderTicket`: `width: 280`
- `EquitiesPositionsBlotter`: `width: 520`
- `EquitiesPanel`: `width: 1280, height: 680, display: flex, flexDirection: column`

### Scenario action added (`tests/ui/visual/scenarioActions.ts`)
`app/equities`: `{ fullPage: true, click: "tab-equities", waitForText: "WATCHLIST" }`.

### Playwright-CT spec created (`tests/ui/visual/playwright-ct/equities.spec.tsx`)
8 tests (one per CT scenario): watchlist-loaded, sector-heatmap, chart-loaded,
depth-ladder, ticket-editing, ticket-filled, positions-with-pnl, panel.
Each asserts a visible DOM element before taking the screenshot.

### Line-height pins added (10 equities CSS modules)
All `font-family: var(--font-mono)` selectors without an explicit `line-height`
pinned using `round(1.4 × font-size)px`:

| File | Selectors pinned |
|------|-----------------|
| `watchlist/Watchlist.module.css` | `.header` 13px, `.row` 17px, `.empty` 15px |
| `watchlist/SectorHeatmap.module.css` | `.sectorLabel` 13px, `.cell` 13px, `.empty` 15px |
| `chart/DepthLadder.module.css` | `.ladder` 15px, `.empty` 15px |
| `chart/PriceChart.module.css` | `.empty` 15px |
| `ticket/OrderTicket.module.css` | `.toggle` 15px, `.label` 13px, `.input` 17px, `.error` 14px, `.submit` 17px, `.status` 15px, `.resetBtn` 14px |
| `blotter/OrdersBlotter.module.css` | `.blotter` 15px, `.empty` 15px |
| `blotter/PositionsBlotter.module.css` | `.blotter` 15px, `.empty` 15px |
| `blotter/DeskPnlGauge.module.css` | `.label` 14px, `.value` 18px |
| `EquitiesPanel.module.css` | `.sectionHeading` 13px, `.blotterTab` 13px, `.placeholder` 17px |
| `tabs/InstrumentTabs.module.css` | `.tab` 15px |

### Pre-existing lint fix (`src/AppRoot.tsx`)
Biome flagged `lint/complexity/noUselessFragments` (pre-existing on this branch,
not introduced by this task). Auto-fixed by `biome check --write`; now downgraded
to `info` (exit 0).

## Gate results

```
pnpm check       ✓ (1 info, 0 errors)
pnpm lint:eslint ✓
pnpm lint:css    ✓
pnpm typecheck   ✓ (9/9 tasks)
pnpm build       ✓ (full turbo)
```

## Golden update results

### playwright-ct (linux-arm64, react/)
`pnpm test:ui:visual:playwright-ct:react:update` — 105/105 passed (8 new equities
goldens generated). Stable on immediate re-run: 105/105 passed.

### playwright app-level (linux-arm64, react/)
`pnpm test:ui:visual:playwright:react:update` — 113/113 passed (9 new equities
goldens generated, including `app/equities` full-page). Stable on immediate re-run:
113/113 passed.

## Files changed (scope)
- `tests/ui/visual/shared/appData.ts`
- `tests/ui/visual/shared/fixtures.ts`
- `tests/ui/visual/shared/scenarios.ts`
- `tests/ui/visual/react/buildFakeHooks.ts`
- `tests/ui/visual/react/registry.tsx`
- `tests/ui/visual/scenarioActions.ts`
- `tests/ui/visual/playwright-ct/equities.spec.tsx` (new)
- 10 equities `*.module.css` files (line-height pins only)
- `src/AppRoot.tsx` (pre-existing biome auto-fix only)
- Generated PNGs in `tests/ui/visual/react-local/linux-arm64/playwright-ct/` and
  `tests/ui/visual/react-local/linux-arm64/playwright/`
