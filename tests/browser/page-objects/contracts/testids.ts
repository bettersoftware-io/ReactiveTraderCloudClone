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
} as const;
