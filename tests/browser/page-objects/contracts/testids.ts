export const TESTIDS = {
  shell: {
    header: "header",
    themeToggle: "theme-toggle",
    tab: (tab: "fx" | "credit" | "admin") => {
      return `tab-${tab}`;
    },
  },
  connection: {
    status: "connection-status",
    overlay: "connection-overlay",
    clearIncident: "connection-overlay-clear-incident",
  },
  liveRates: {
    tilePrefix: "tile-",
    tile: (pair: string) => {
      return `tile-${pair}`;
    },
    sellBtn: "sell-btn",
    buyBtn: "buy-btn",
    tradeConfirmation: "trade-confirmation",
    currencyFilter: "currency-filter",
    filter: (category: string) => {
      return `filter-${category}`;
    },
    /** Head-slot chip (LiveRatesHead) that toggles tile sparklines. No
     * Price/Chart text — reflect its on/off state via `data-active`. */
    chartsToggle: "charts-toggle",
    /** Per-tile sparkline (TileChart), rendered only when the charts toggle is
     * active. Deliberately does NOT start with `tile-` — that prefix is reserved
     * for per-pair tile roots (`tilePrefix`) and a collision double-counts
     * `[data-testid^="tile-"]` prefix queries (e.g. LiveRatesPanelPage.tileCount). */
    tileChart: "sparkline",
  },
  blotter: {
    table: "blotter-table",
    quickFilter: "quick-filter",
    exportCsv: "export-csv",
  },
  analytics: {
    panel: "analytics-panel",
  },
  positions: {
    panel: "positions-panel",
    bubblePrefix: "exposure-bubble-",
    bubble: (currency: string) => {
      return `exposure-bubble-${currency}`;
    },
    rowPrefix: "exposure-row-",
    row: (currency: string) => {
      return `exposure-row-${currency}`;
    },
  },
  credit: {
    nav: "credit-nav",
    tab: (v: "tiles" | "new-rfq" | "sell-side") => {
      return `credit-tab-${v}`;
    },
    directionLabel: "rfq-direction-label",
  },
  admin: {
    incident: {
      inject: (kind: string) => {
        return `incident-${kind}`;
      },
      clear: "incident-clear",
    },
  },
  layout: {
    // Splitter handles carry a dynamic id `handle-<pathKey>-<index>`; the engine
    // owns the full id, so consumers match on this stable prefix.
    handlePrefix: "handle-",
  },
} as const;
