export const TESTIDS = {
  shell: {
    header: "header",
    themeToggle: "theme-toggle",
    tab: (tab: "fx" | "credit" | "admin") => `tab-${tab}`,
  },
  connection: {
    status: "connection-status",
    overlay: "connection-overlay",
  },
  liveRates: {
    tile: (pair: string) => `tile-${pair}`,
    sellBtn: "sell-btn",
    buyBtn: "buy-btn",
    tradeConfirmation: "trade-confirmation",
    currencyFilter: "currency-filter",
    filter: (category: string) => `filter-${category}`,
    viewToggle: "view-toggle",
  },
  blotter: {
    table: "blotter-table",
    quickFilter: "quick-filter",
    exportCsv: "export-csv",
  },
  analytics: {
    panel: "analytics-panel",
  },
  credit: {
    nav: "credit-nav",
    tab: (v: "tiles" | "new-rfq" | "sell-side") => `credit-tab-${v}`,
  },
} as const;
