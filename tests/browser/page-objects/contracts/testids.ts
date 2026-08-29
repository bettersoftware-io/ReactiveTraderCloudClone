export const TESTIDS = {
  shell: {
    header: "header",
    themeToggle: "theme-toggle",
    powerSaverToggle: "power-saver-toggle",
    tab: (tab: "fx" | "credit" | "admin" | "equities") => {
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
  /**
   * The equities interactive candle chart (CandleChart.tsx / TimeAxis.tsx /
   * BackToLiveButton.tsx). Only the ids the e2e smoke needs — the fuller
   * pixel/gesture surface (grid lines, crosshair, indicators…) is exercised
   * by the ui-contract CandleChartPage instead.
   */
  equities: {
    chart: {
      plot: "chart-plot",
      backToLive: "chart-back-to-live",
      timeLabel: "chart-time-label",
      navigator: "chart-navigator",
      navigatorWindow: "navigator-window",
      navigatorHandleRight: "navigator-handle-right",
      /** The RSI/MACD indicator-pane toggle pill (IndicatorPills.tsx) — one
       * shared testid for both, disambiguated by the `data-pane` attribute
       * (see `PlaywrightEquitiesChart.panePill`, which composes the two via
       * `Locator.and`). */
      panePill: "chart-pane-pill",
      /** The trendline/horizontal-level draw-tool selector pill
       * (DrawToolPills.tsx) — one shared testid for both tools,
       * disambiguated by the `data-tool` attribute (same `.and` composition
       * as `panePill`/`PlaywrightEquitiesChart.drawPill`). */
      drawPill: "chart-draw-pill",
      /** A committed chart annotation — trendline or horizontal level
       * (DrawingsLayer.tsx). Carries `data-kind`/`data-selected`/`data-draft`;
       * the layer's SVG is `pointer-events: none`, so selecting one is
       * driven by clicking the PLOT at the drawing's own coordinates, never
       * the drawing element itself (see
       * `PlaywrightEquitiesChart.clickDrawing`). */
      drawing: "chart-drawing",
      /** A selected drawing's endpoint-drag handle (DrawingsLayer.tsx) — a
       * trendline renders two (one per anchor), an hline renders at most
       * one (its midpoint); `cx`/`cy` are plot-percent, matching the
       * drawing's own `x1`/`y1`/`x2`/`y2` coordinate space. */
      drawingHandle: "chart-drawing-handle",
      /** The LOG price-axis pill (IndicatorPills.tsx) — toggles the chart
       * wrap's `data-yscale` between `"linear"` and `"log"`. */
      yScalePill: "chart-yscale-pill",
      /** An active RSI/MACD indicator pane's root (IndicatorPane.tsx). */
      pane: (kind: "rsi" | "macd") => {
        return `chart-pane-${kind}`;
      },
      /** The pane's live crosshair readout row — rendered only while the
       * shared crosshair cursor is active over the plot or a pane. */
      paneReadout: "chart-pane-readout",
      /** The SMA20/EMA50 overlay toggle pill (IndicatorPills.tsx) — one
       * shared testid for both, disambiguated by the `data-ind` attribute
       * (mirrors `panePill`'s `data-pane`-disambiguated pattern above). */
      indicatorPill: "chart-indicator-pill",
      /** The VS comparison-symbol pill (ComparePills.tsx) — one shared
       * testid for every candidate, disambiguated by the `data-sym`
       * attribute (same `.and` composition as `panePill`/`indicatorPill`
       * above). */
      comparePill: "chart-compare-pill",
      /** The comparison close-line polyline overlay (SvgPathLayer.tsx),
       * rendered while a comparison is active. */
      compareLine: "chart-compare-line",
      /** The canvas-substrate plot (SceneCanvas), rendered instead of the
       * DOM grid/candles/drawings tree when the Chart renderer preference
       * (`useChartSubstrate`) is "canvas" (ChartPlot.tsx). Carries
       * `data-candles`/`data-drawings`/`data-compare` witness attributes
       * (SceneCanvas's `summary` prop) — the only cross-substrate geometry
       * signal available, since the canvas painting itself isn't
       * inspectable. */
      canvasPlot: "chart-canvas-plot",
      /** The main plot's crosshair OHLCV + time readout chip
       * (CrosshairOverlay.tsx) — rendered in BOTH substrates (only the
       * hairlines are substrate-gated, see the component's `linesHidden`
       * doc). */
      crosshairReadout: "chart-crosshair-readout",
    },
  },
  /**
   * The Preferences catalogue modal (PreferencesModal.tsx) plus the
   * account-menu chrome needed to reach it (AccountMenu.tsx) — the repo's
   * FIRST e2e page-object surface driving this modal. Only the ids the
   * canvas-substrate journey needs (Chart renderer / `useChartSubstrate`);
   * the modal's fuller catalogue (Display/Motion/Trading/Jarvis rows, etc.)
   * is exercised by unit + contract tests instead.
   */
  prefs: {
    /** Account-menu trigger (AccountMenu.tsx) — reveals the ⚙ Preferences
     * row below once clicked. */
    accountToggle: "account-toggle",
    /** The ⚙ Preferences row inside the opened account panel; opens the
     * modal (`onOpenPrefs`, HeaderChrome.tsx). */
    openTrigger: "account-prefs",
    modal: "prefs-modal",
    /** Header ✕ close button — dismisses the modal identically to `done`
     * below (PreferencesModal.tsx's shared `onClose`). */
    close: "prefs-close",
    /** Footer DONE button — dismisses the modal identically to `close`
     * above. */
    done: "prefs-done",
    /** The Chart renderer segment row's two options (PrefSegment.tsx
     * composes `${testid}-${option.value}`, testid=
     * "pref-segment-chartSubstrate"). */
    chartSubstrateSegment: (value: "dom" | "canvas") => {
      return `pref-segment-chartSubstrate-${value}`;
    },
    /** The Layout engine segment row's two options (PrefSegment.tsx
     * composes `${testid}-${option.value}`, testid=
     * "pref-segment-layoutEngine"). */
    layoutEngineSegment: (value: "inhouse" | "dockview") => {
      return `pref-segment-layoutEngine-${value}`;
    },
  },
  layout: {
    // Splitter handles carry a dynamic id `handle-<pathKey>-<index>`; the engine
    // owns the full id, so consumers match on this stable prefix.
    handlePrefix: "handle-",
    /** A layout-engine panel's own root testid (InhouseLayoutEngine.tsx's
     * PanelLeaf) — carries `data-maximized`/`data-strip`/`data-collapsed`. */
    panel: (panelId: string) => {
      return `panel-${panelId}`;
    },
    /** The active layout engine's own root (InhouseLayoutEngine.tsx /
     * DockviewLayoutEngine.tsx — the two are alternates, never both
     * mounted at once). Carries `data-engine` ("inhouse"|"dockview") and,
     * dockview only, `data-groups` (the live dockview group count). */
    engineRoot: "layout-engine",
    /** A panel's head slot as mounted INSIDE dockview's own draggable tab
     * (`.dv-tab`) by DockviewLayoutEngine.tsx — the handle to grab for a
     * drag-dock. Dockview engine only. */
    dockTab: (panelId: string) => {
      return `dock-tab-${panelId}`;
    },
  },
  /**
   * J.A.R.V.I.S assistant (JarvisOrb / JarvisOverlay / JarvisConfirmCard,
   * packages/client-{react,solid}/src/ui/shell/jarvis/). `entry` is shared by
   * every message row (user and jarvis alike) — distinguish with the
   * `data-role` attribute; the streaming reply is always the LAST entry with
   * `data-role="jarvis"`, and its `data-done` attribute flips "false" →
   * "true" once the scripted brain finishes revealing it.
   */
  jarvis: {
    orb: "jarvis-orb",
    overlay: "jarvis-overlay",
    close: "jarvis-close",
    entry: "jarvis-entry",
    input: "jarvis-input",
    send: "jarvis-send",
    confirmCard: "jarvis-confirm-card",
    confirmApprove: "jarvis-confirm-approve",
    confirmReject: "jarvis-confirm-reject",
    /** Generative-UI desk panels (JarvisPanelLayer,
     * packages/client-{react,solid}/src/ui/shell/jarvis/panels/). `panel` is
     * shared by every panel card — distinguish with the `data-panel-id` /
     * `data-status` attributes. `panelLine` / `panelHeatmap` are the
     * per-viz-kind body renderers; only the one matching the panel's current
     * `viz.kind` is ever mounted. The layer itself unmounts once no panels
     * remain (mirrors `overlay`'s `!open` → null pattern). */
    panelLayer: "jarvis-panel-layer",
    panel: "jarvis-panel",
    panelLine: "jarvis-panel-line",
    panelHeatmap: "jarvis-panel-heatmap",
    panelDismiss: "jarvis-panel-dismiss",
    /** The floating card's 📌 dock button (JarvisPanelLayer.tsx) that pins
     * a desk panel into the workspace as an `InhouseLayoutEngine` leaf (see
     * `TESTIDS.layout.panel` — the docked section's own testid). */
    panelDock: "jarvis-panel-dock",
    /** A DOCKED panel's own head (`JarvisDockedPanelHead.tsx`, rendered
     * inside `TESTIDS.layout.panel(panelId)`) — 📌 unpins it back to the
     * floating layer. */
    panelUndock: "jarvis-panel-undock",
    /** The ⓘ toggle beside the overlay's ✕ (JarvisOverlay.tsx) that opens/
     * closes the demo guide panel below. */
    guideToggle: "jarvis-guide-toggle",
    /** The guide panel itself (`aside`), rendered only while `guideOpen`. */
    guidePanel: "jarvis-guide-panel",
    /** One button per catalog command inside the guide panel — shared
     * testid across every row, its own visible text IS the command. */
    guideRow: "jarvis-guide-row",
    /** Footer's always-visible ▶ RUN FULL DEMO button (hidden while the
     * demo is running, replaced by `demoProgress`/`demoStop`). */
    demoRun: "jarvis-demo-run",
    /** Footer's `STEP i/7 · LABEL` readout, rendered only while the demo
     * (`JarvisDemoMachine`) is running. */
    demoProgress: "jarvis-demo-progress",
    /** Footer's ■ STOP button, rendered only while the demo is running. */
    demoStop: "jarvis-demo-stop",
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
    timelineRow: "timeline-row",
    pinnedBar: "pinned-bar",
    navNode: "nav-node",
    clearLog: "clear-log",
    unclearLog: "unclear-log",
  },
  /**
   * The full-screen boot splash (BootSequence), mounted by BootGate OUTSIDE
   * AuthGate (see AppRoot.tsx) — visible pre-auth, identically on react and
   * solid.
   */
  boot: {
    sequence: "boot-sequence",
  },
} as const;
