export const TESTIDS = {
  shell: {
    header: "header",
    themeToggle: "theme-toggle",
    powerSaverToggle: "power-saver-toggle",
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
    /** The compact ⚡ RFQ chip in the tile header's pair row (the RFQ
     * init-state affordance; its visible text is just "⚡ RFQ" — the
     * "Initiate RFQ" name lives in title/aria-label). */
    rfqInitiate: "rfq-initiate",
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
  /**
   * The credit dock (PR replacing the old tabbed CreditWorkspace): New RFQ
   * form, RFQs card list, and Credit Blotter are all simultaneously visible
   * panels — there is no nav/tab to switch between them any more.
   */
  credit: {
    newRfq: {
      headTitle: "new-rfq-head-title",
      dirButton: (dir: "buy" | "sell") => {
        return `new-rfq-dir-${dir}`;
      },
      instrumentToggle: "new-rfq-instrument-toggle",
      instrumentOption: (instrumentId: number) => {
        return `new-rfq-instrument-option-${instrumentId}`;
      },
      qtyInput: "new-rfq-qty-input",
      dealer: (dealerId: number) => {
        return `new-rfq-dealer-${dealerId}`;
      },
      send: "new-rfq-send",
      confirmed: "new-rfq-confirmed",
    },
    rfqs: {
      headTitle: "rfqs-head-title",
      filterPill: (filter: "live" | "closed" | "all") => {
        return `rfq-filter-${filter}`;
      },
      card: (rfqId: number) => {
        return `rfq-card-${rfqId}`;
      },
      /** Prefix-matched (not exact — see liveRates.tilePrefix's comment for
       * why): a QuoteRow's own testid (`rfq-quote-<id>`) shares this prefix
       * with its nested bank-name span (`rfq-quote-bank-<id>`) and accept
       * button (`rfq-quote-accept-<id>`); combine with the `[data-state]`
       * attribute (only the row itself carries it) to select just the row. */
      quotePrefix: "rfq-quote-",
    },
    blotterHeadTitle: "credit-blotter-head-title",
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
  /**
   * LoginScreen (packages/client-react/src/ui/shell/auth/LoginScreen.tsx),
   * rendered by AuthGate whenever `useAuth().state.status !== "authenticated"`.
   */
  auth: {
    loginScreen: "login-screen",
    loginTitle: "login-title",
    loginUsername: "login-username",
    loginPassword: "login-password",
    loginSubmit: "login-submit",
    loginError: "login-error",
  },
  /**
   * The same-origin DevTools inspector SPA (@rtc/devtools-app), served at
   * `/devtools/`. These ids live in the inspector's own components
   * (InspectorApp / StateTreePanel / MachinesPanel), not in the app under test.
   */
  devtools: {
    connectionBadge: "connection-badge",
    streamRow: "devtools-stream-row",
    machineRow: "devtools-machine-row",
  },
} as const;
