// Neutral manifest: a scenario name maps to a component key (resolved per
// framework by registry.tsx) and a fixture key (resolved from fixtures.ts).
export interface Scenario {
  readonly componentKey: string;
  readonly fixtureKey: string;
}

export const scenarios: Record<string, Scenario> = {
  "connection-status/connected": {
    componentKey: "ConnectionStatusBar",
    fixtureKey: "connection-connected",
  },
  "connection-status/disconnected": {
    componentKey: "ConnectionStatusBar",
    fixtureKey: "connection-disconnected",
  },
  "tile/eurusd-up": { componentKey: "Tile", fixtureKey: "tile-eurusd-up" },
  "tile/loading": { componentKey: "Tile", fixtureKey: "tile-loading" },
  "analytics/populated": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-populated" },
  "analytics/loading": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-loading" },
  "connection-overlay/offline": { componentKey: "ConnectionOverlay", fixtureKey: "connection-offline" },
  "live-rates/populated": { componentKey: "LiveRatesPanel", fixtureKey: "live-rates-populated" },
  "app/fx": { componentKey: "App", fixtureKey: "app-fx" },
  // FX blotter populated with trades (the app/fx page only ever shows it empty).
  "fx-blotter/populated": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  // A newly-arrived (isNew) row: snapshots the blue new-row highlight branch.
  // Now that the highlight is injected through the seam (useRowHighlight), the
  // highlighted state is a deterministic static shot — no timer, no waiting.
  "fx-blotter/highlighted-row": { componentKey: "BlotterRowHighlighted", fixtureKey: "fx-trades" },
  // The isolated non-highlighted baseline for the row above (isNew=false →
  // settled/transparent), so the highlight is the only delta when the two are
  // diffed as isolated components.
  "fx-blotter/non-highlighted-row": { componentKey: "BlotterRowDefault", fixtureKey: "fx-trades" },
  // Credit tab — component-level views + the full page (Credit tab active).
  "credit/rfq-tiles": { componentKey: "RfqTilesPanel", fixtureKey: "credit-populated" },
  "credit/new-rfq": { componentKey: "NewRfqForm", fixtureKey: "credit-populated" },
  "credit/blotter": { componentKey: "CreditBlotter", fixtureKey: "credit-populated" },
  "credit/sell-side": { componentKey: "SellSidePanel", fixtureKey: "credit-populated" },
  "app/credit": { componentKey: "App", fixtureKey: "credit-populated" },
  // Admin tab — App with the throughput fetch stubbed by the spec.
  "app/admin": { componentKey: "App", fixtureKey: "app-fx" },
  // Light-theme variant of the FX page (fixture seeds theme "light" through the seam).
  "app/fx-light": { componentKey: "App", fixtureKey: "app-fx-light" },

  // --- Phase V deterministic golden scenarios ---
  // FX tiles: TilePrice DOWN / NONE colour arms + TileChart down/empty arms.
  "tile/eurusd-down": { componentKey: "Tile", fixtureKey: "tile-eurusd-down" },
  "tile/eurusd-flat": { componentKey: "Tile", fixtureKey: "tile-eurusd-flat" },
  "tile/chart-down": { componentKey: "TileChart", fixtureKey: "tile-chart-down" },
  "tile/chart-empty": { componentKey: "TileChart", fixtureKey: "tile-chart-empty" },
  // TileChart green (isUp) sparkline arm + the all-equal-mids flat (range `|| 1`) arm.
  "tile/chart-up": { componentKey: "TileChart", fixtureKey: "tile-chart-up" },
  "tile/chart-flat": { componentKey: "TileChart", fixtureKey: "tile-chart-flat" },
  // FX live-rates: price view seeded through the seam (ViewToggle "Chart" label / price-mode arm).
  "live-rates/price-view": { componentKey: "LiveRatesPanel", fixtureKey: "live-rates-price" },
  // FX analytics: negative / empty / all-flat arms.
  "analytics/negative-pnl": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-negative" },
  "analytics/empty": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-empty" },
  "analytics/flat-positions": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-flat" },
  // Million-scale all-positive: PnlValue/PairPnlBars "m" labels + PnlChart no-zero-line.
  "analytics/millions": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-millions" },
  // Credit RFQ cards: terminal-state badges + accepted/passed quote colours.
  "credit/rfq-tiles-done": { componentKey: "RfqCard", fixtureKey: "rfq-done" },
  "credit/rfq-tiles-expired": { componentKey: "RfqCard", fixtureKey: "rfq-expired" },
  "credit/rfq-tiles-cancelled": { componentKey: "RfqCard", fixtureKey: "rfq-cancelled" },
  "credit/rfq-tiles-accepted": { componentKey: "RfqCard", fixtureKey: "rfq-accepted" },
  "credit/rfq-tiles-passed": { componentKey: "RfqCard", fixtureKey: "rfq-passed" },
  "credit/rfq-tiles-empty": { componentKey: "RfqTilesPanel", fixtureKey: "rfq-tiles-empty" },
  // Credit sell-side ticket arms + empty; credit blotter empty.
  "credit/sell-side-active": { componentKey: "SellSidePanel", fixtureKey: "sell-side-active" },
  "credit/sell-side-responded": { componentKey: "SellSidePanel", fixtureKey: "sell-side-responded" },
  "credit/sell-side-empty": { componentKey: "SellSidePanel", fixtureKey: "sell-side-empty" },
  // TradeTicket render arms: the responded-view ternary (Passed / RFQ Cancelled /
  // RFQ Expired / Responded fallback), the else-arm labels (Closed / Cancelled /
  // Expired for a still-pending ticket on a non-Open rfq), and the instrument-name
  // fallback. State is seeded through the seam (no interaction).
  "credit/sell-side-passed": { componentKey: "SellSidePanel", fixtureKey: "sell-side-passed" },
  "credit/sell-side-rfq-cancelled": { componentKey: "SellSidePanel", fixtureKey: "sell-side-rfq-cancelled" },
  "credit/sell-side-rfq-expired": { componentKey: "SellSidePanel", fixtureKey: "sell-side-rfq-expired" },
  "credit/sell-side-responded-fallback": { componentKey: "SellSidePanel", fixtureKey: "sell-side-responded-fallback" },
  "credit/sell-side-closed": { componentKey: "SellSidePanel", fixtureKey: "sell-side-closed" },
  "credit/sell-side-cancelled-pending": { componentKey: "SellSidePanel", fixtureKey: "sell-side-cancelled-pending" },
  "credit/sell-side-expired-pending": { componentKey: "SellSidePanel", fixtureKey: "sell-side-expired-pending" },
  "credit/sell-side-no-instrument": { componentKey: "SellSidePanel", fixtureKey: "sell-side-no-instrument" },
  "credit/blotter-empty": { componentKey: "CreditBlotter", fixtureKey: "credit-blotter-empty" },
  // CreditBlotter degraded row: accepted quote with an unresolved dealer/instrument
  // → the `?? "Dealer N"` counterparty + empty CUSIP/Security (`?? ""`) fallbacks.
  "credit/blotter-unresolved": { componentKey: "CreditBlotter", fixtureKey: "credit-blotter-unresolved" },
  // Credit workspace sub-views (click the credit-tab-* control).
  "credit/workspace-new-rfq": { componentKey: "CreditWorkspace", fixtureKey: "credit-populated" },
  "credit/workspace-sell-side": { componentKey: "CreditWorkspace", fixtureKey: "credit-populated" },
  // Admin panel loaded (slider) state — throughput fetch stubbed.
  "admin/panel-loaded": { componentKey: "AdminPanel", fixtureKey: "app-fx" },
  // Seeded render-state arms with no interaction (the states are only transiently
  // reachable at runtime, so they are seeded through the seam for a stable golden):
  // AdminPanel loading, and the NewRfqForm submission in-flight / success views.
  "admin/panel-loading": { componentKey: "AdminPanel", fixtureKey: "admin-loading" },
  "credit/new-rfq-submitting": { componentKey: "NewRfqForm", fixtureKey: "credit-new-rfq-submitting" },
  "credit/new-rfq-confirmed": { componentKey: "NewRfqForm", fixtureKey: "credit-new-rfq-confirmed" },

  // --- Phase V testid-gated interaction scenarios (see scenarioActions.ts) ---
  // FX blotter sort + filter + popovers (drive BlotterHeader / *Filter).
  "fx-blotter/sorted": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  "fx-blotter/filtered": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  "fx-blotter/no-match": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  "fx-blotter/filter-date": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  "fx-blotter/filter-number": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  "fx-blotter/filter-set": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  // Credit RFQ "All" filter tab (RfqFilterTabs).
  "credit/rfq-tiles-all": { componentKey: "RfqTilesPanel", fixtureKey: "credit-populated" },
  // Credit new-RFQ form states (InstrumentSearch / QuantityInput / submit gate).
  "credit/new-rfq-search-open": { componentKey: "NewRfqForm", fixtureKey: "credit-populated" },
  "credit/new-rfq-instrument-selected": { componentKey: "NewRfqForm", fixtureKey: "credit-populated" },
  "credit/new-rfq-filled": { componentKey: "NewRfqForm", fixtureKey: "credit-populated" },
  "credit/new-rfq-invalid": { componentKey: "NewRfqForm", fixtureKey: "credit-populated" },

  // --- Phase 9 deterministic tile execution / RFQ / stale arms ---
  // Their state is now injected through the seam (per-symbol tileExecution /
  // rfqTile / stale records), so each transient timer state is a static shot —
  // no scenarioActions (no clicks / waits).
  // TileConfirmation overlay arms.
  "tile/execution-started": { componentKey: "Tile", fixtureKey: "tile-exec-started" },
  "tile/execution-too-long": { componentKey: "Tile", fixtureKey: "tile-exec-too-long" },
  "tile/execution-timeout": { componentKey: "Tile", fixtureKey: "tile-exec-timeout" },
  "tile/execution-done": { componentKey: "Tile", fixtureKey: "tile-exec-done" },
  "tile/execution-rejected": { componentKey: "Tile", fixtureKey: "tile-exec-rejected" },
  "tile/execution-credit-exceeded": { componentKey: "Tile", fixtureKey: "tile-exec-credit-exceeded" },
  "tile/execution-finished-timeout": { componentKey: "Tile", fixtureKey: "tile-exec-finished-timeout" },
  // TileRfq body arms (RfqCountdown green vs amber low-time).
  "tile/rfq-requested": { componentKey: "Tile", fixtureKey: "tile-rfq-requested" },
  "tile/rfq-received": { componentKey: "Tile", fixtureKey: "tile-rfq-received" },
  "tile/rfq-received-low": { componentKey: "Tile", fixtureKey: "tile-rfq-received-low" },
  "tile/rfq-rejected": { componentKey: "Tile", fixtureKey: "tile-rfq-rejected" },
  // StaleIndicator "Reconnecting…" overlay arm.
  "tile/stale": { componentKey: "Tile", fixtureKey: "tile-stale" },
};
