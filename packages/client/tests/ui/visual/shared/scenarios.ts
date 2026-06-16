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
  // Credit tab — component-level views + the full page (Credit tab active).
  "credit/rfq-tiles": { componentKey: "RfqTilesPanel", fixtureKey: "credit-populated" },
  "credit/new-rfq": { componentKey: "NewRfqForm", fixtureKey: "credit-populated" },
  "credit/blotter": { componentKey: "CreditBlotter", fixtureKey: "credit-populated" },
  "credit/sell-side": { componentKey: "SellSidePanel", fixtureKey: "credit-populated" },
  "app/credit": { componentKey: "App", fixtureKey: "credit-populated" },
  // Admin tab — App with the throughput fetch stubbed by the spec.
  "app/admin": { componentKey: "App", fixtureKey: "app-fx" },
  // Light-theme variant of the FX page (spec seeds localStorage rtc-theme=light).
  "app/fx-light": { componentKey: "App", fixtureKey: "app-fx" },

  // --- Phase V deterministic golden scenarios ---
  // FX tiles: TilePrice DOWN / NONE colour arms + TileChart down/empty arms.
  "tile/eurusd-down": { componentKey: "Tile", fixtureKey: "tile-eurusd-down" },
  "tile/eurusd-flat": { componentKey: "Tile", fixtureKey: "tile-eurusd-flat" },
  "tile/chart-down": { componentKey: "TileChart", fixtureKey: "tile-chart-down" },
  "tile/chart-empty": { componentKey: "TileChart", fixtureKey: "tile-chart-empty" },
  // FX live-rates: toggle to price view (ViewToggle "Chart" label / stored-mode arm).
  "live-rates/price-view": { componentKey: "LiveRatesPanel", fixtureKey: "live-rates-populated" },
  // FX analytics: negative / empty / all-flat arms.
  "analytics/negative-pnl": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-negative" },
  "analytics/empty": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-empty" },
  "analytics/flat-positions": { componentKey: "AnalyticsPanel", fixtureKey: "analytics-flat" },
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
  "credit/blotter-empty": { componentKey: "CreditBlotter", fixtureKey: "credit-blotter-empty" },
  // Credit workspace sub-views (click the credit-tab-* control).
  "credit/workspace-new-rfq": { componentKey: "CreditWorkspace", fixtureKey: "credit-populated" },
  "credit/workspace-sell-side": { componentKey: "CreditWorkspace", fixtureKey: "credit-populated" },
  // Admin panel loaded (slider) state — throughput fetch stubbed.
  "admin/panel-loaded": { componentKey: "AdminPanel", fixtureKey: "app-fx" },

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
};
