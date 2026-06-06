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
};
