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
  "analytics/populated": {
    componentKey: "AnalyticsPanel",
    fixtureKey: "analytics-populated",
  },
  "analytics/loading": {
    componentKey: "AnalyticsPanel",
    fixtureKey: "analytics-loading",
  },
  "connection-overlay/offline": {
    componentKey: "ConnectionOverlay",
    fixtureKey: "connection-offline",
  },
  "connection-overlay/idle": {
    componentKey: "ConnectionOverlay",
    fixtureKey: "connection-idle",
  },
  "live-rates/populated": {
    componentKey: "LiveRatesPanel",
    fixtureKey: "live-rates-populated",
  },
  "app/fx": { componentKey: "App", fixtureKey: "app-fx" },
  // FX blotter populated with trades (the app/fx page only ever shows it empty).
  "fx-blotter/populated": {
    componentKey: "FxBlotter",
    fixtureKey: "fx-trades",
  },
  // A newly-arrived (isNew) row: snapshots the blue new-row highlight branch.
  // Now that the highlight is injected through the seam (useRowHighlight), the
  // highlighted state is a deterministic static shot — no timer, no waiting.
  "fx-blotter/highlighted-row": {
    componentKey: "BlotterRowHighlighted",
    fixtureKey: "fx-trades",
  },
  // The isolated non-highlighted baseline for the row above (isNew=false →
  // settled/transparent), so the highlight is the only delta when the two are
  // diffed as isolated components.
  "fx-blotter/non-highlighted-row": {
    componentKey: "BlotterRowDefault",
    fixtureKey: "fx-trades",
  },
  // Credit tab — component-level views + the full page (Credit tab active).
  "credit/rfq-tiles": {
    componentKey: "RfqTilesPanel",
    fixtureKey: "credit-populated",
  },
  "credit/new-rfq": {
    componentKey: "NewRfqForm",
    fixtureKey: "credit-populated",
  },
  "credit/blotter": {
    componentKey: "CreditBlotter",
    fixtureKey: "credit-populated",
  },
  "credit/sell-side": {
    componentKey: "SellSidePanel",
    fixtureKey: "credit-populated",
  },
  "app/credit": { componentKey: "App", fixtureKey: "credit-populated" },
  // Admin tab — App with the throughput fetch stubbed by the spec.
  "app/admin": { componentKey: "App", fixtureKey: "app-fx" },
  // Light-theme variant of the FX page (fixture seeds theme "light" through the seam).
  "app/fx-light": { componentKey: "App", fixtureKey: "app-fx-light" },
  // System mode-preference variant: pins the third (🖥️) toggle icon (resolves to dark).
  "app/fx-system": { componentKey: "App", fixtureKey: "app-fx-system" },

  // --- Phase V deterministic golden scenarios ---
  // FX tiles: TilePrice DOWN / NONE colour arms + TileChart down/empty arms.
  "tile/eurusd-down": { componentKey: "Tile", fixtureKey: "tile-eurusd-down" },
  "tile/eurusd-flat": { componentKey: "Tile", fixtureKey: "tile-eurusd-flat" },
  "tile/chart-down": {
    componentKey: "TileChart",
    fixtureKey: "tile-chart-down",
  },
  "tile/chart-empty": {
    componentKey: "TileChart",
    fixtureKey: "tile-chart-empty",
  },
  // TileChart green (isUp) sparkline arm + the all-equal-mids flat (range `|| 1`) arm.
  "tile/chart-up": { componentKey: "TileChart", fixtureKey: "tile-chart-up" },
  "tile/chart-flat": {
    componentKey: "TileChart",
    fixtureKey: "tile-chart-flat",
  },
  // FX live-rates: price view seeded through the seam (the CHARTS toggle now
  // lives in LiveRatesHead; this pins the panel's price-mode arm itself).
  "live-rates/price-view": {
    componentKey: "LiveRatesPanel",
    fixtureKey: "live-rates-price",
  },
  // FX analytics: negative / empty / all-flat arms.
  "analytics/negative-pnl": {
    componentKey: "AnalyticsPanel",
    fixtureKey: "analytics-negative",
  },
  "analytics/empty": {
    componentKey: "AnalyticsPanel",
    fixtureKey: "analytics-empty",
  },
  "analytics/flat-positions": {
    componentKey: "AnalyticsPanel",
    fixtureKey: "analytics-flat",
  },
  // Million-scale all-positive: PnlValue/PairPnlBars "m" labels + PnlChart no-zero-line.
  "analytics/millions": {
    componentKey: "AnalyticsPanel",
    fixtureKey: "analytics-millions",
  },
  // PositionsPanel — the FX net-exposure bubble/ladder panel (restyled out of
  // AnalyticsPanel; see fx/positions/PositionsPanel.tsx). Same fixture pattern
  // as analytics/* above: a seeded world, a USD-dominated-negative world, and
  // an empty (no positions) world.
  "positions/populated": {
    componentKey: "PositionsPanel",
    fixtureKey: "analytics-populated",
  },
  "positions/negative": {
    componentKey: "PositionsPanel",
    fixtureKey: "positions-negative",
  },
  "positions/empty": {
    componentKey: "PositionsPanel",
    fixtureKey: "analytics-empty",
  },
  // Credit RFQ cards: terminal-state badges + accepted/passed quote colours.
  "credit/rfq-tiles-done": { componentKey: "RfqCard", fixtureKey: "rfq-done" },
  "credit/rfq-tiles-expired": {
    componentKey: "RfqCard",
    fixtureKey: "rfq-expired",
  },
  "credit/rfq-tiles-cancelled": {
    componentKey: "RfqCard",
    fixtureKey: "rfq-cancelled",
  },
  "credit/rfq-tiles-accepted": {
    componentKey: "RfqCard",
    fixtureKey: "rfq-accepted",
  },
  "credit/rfq-tiles-passed": {
    componentKey: "RfqCard",
    fixtureKey: "rfq-passed",
  },
  "credit/rfq-tiles-empty": {
    componentKey: "RfqTilesPanel",
    fixtureKey: "rfq-tiles-empty",
  },
  // Credit sell-side ticket arms + empty; credit blotter empty.
  "credit/sell-side-active": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-active",
  },
  "credit/sell-side-responded": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-responded",
  },
  "credit/sell-side-empty": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-empty",
  },
  // TradeTicket render arms: the responded-view ternary (Passed / RFQ Cancelled /
  // RFQ Expired / Responded fallback), the else-arm labels (Closed / Cancelled /
  // Expired for a still-pending ticket on a non-Open rfq), and the instrument-name
  // fallback. State is seeded through the seam (no interaction).
  "credit/sell-side-passed": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-passed",
  },
  "credit/sell-side-rfq-cancelled": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-rfq-cancelled",
  },
  "credit/sell-side-rfq-expired": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-rfq-expired",
  },
  "credit/sell-side-responded-fallback": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-responded-fallback",
  },
  "credit/sell-side-closed": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-closed",
  },
  "credit/sell-side-cancelled-pending": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-cancelled-pending",
  },
  "credit/sell-side-expired-pending": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-expired-pending",
  },
  "credit/sell-side-no-instrument": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-no-instrument",
  },
  "credit/blotter-empty": {
    componentKey: "CreditBlotter",
    fixtureKey: "credit-blotter-empty",
  },
  // CreditBlotter degraded row: accepted quote with an unresolved dealer/instrument
  // → the `?? "Dealer N"` counterparty + empty CUSIP/Security (`?? ""`) fallbacks.
  "credit/blotter-unresolved": {
    componentKey: "CreditBlotter",
    fixtureKey: "credit-blotter-unresolved",
  },
  // Credit workspace sub-views (click the credit-tab-* control).
  "credit/workspace-new-rfq": {
    componentKey: "CreditWorkspace",
    fixtureKey: "credit-populated",
  },
  "credit/workspace-sell-side": {
    componentKey: "CreditWorkspace",
    fixtureKey: "credit-populated",
  },
  // --- Phase 4: Equities panel scenarios ---
  // Per-component sub-views with deterministic fixed-data fixtures.
  "equities/watchlist-loaded": {
    componentKey: "EquitiesWatchlist",
    fixtureKey: "equities-loaded",
  },
  "equities/sector-heatmap": {
    componentKey: "EquitiesSectorHeatmap",
    fixtureKey: "equities-loaded",
  },
  "equities/chart-loaded": {
    componentKey: "EquitiesPriceChart",
    fixtureKey: "equities-loaded",
  },
  "equities/depth-ladder": {
    componentKey: "EquitiesDepthLadder",
    fixtureKey: "equities-loaded",
  },
  "equities/ticket-editing": {
    componentKey: "EquitiesOrderTicket",
    fixtureKey: "equities-ticket-editing",
  },
  "equities/ticket-filled": {
    componentKey: "EquitiesOrderTicket",
    fixtureKey: "equities-ticket-filled",
  },
  "equities/positions-with-pnl": {
    componentKey: "EquitiesPositionsBlotter",
    fixtureKey: "equities-loaded",
  },
  // Full EquitiesPanel at fixed 1280×680 (mirrors layout-engine constraint).
  "equities/panel": {
    componentKey: "EquitiesPanel",
    fixtureKey: "equities-loaded",
  },
  // Full App shot with the equities tab active (parallels app/fx + app/credit).
  "app/equities": { componentKey: "App", fixtureKey: "equities-loaded" },

  // Admin panel loaded (slider) state — throughput fetch stubbed.
  "admin/panel-loaded": { componentKey: "AdminPanel", fixtureKey: "app-fx" },
  // Seeded render-state arms with no interaction (the states are only transiently
  // reachable at runtime, so they are seeded through the seam for a stable golden):
  // AdminPanel loading, and the NewRfqForm submission in-flight / success views.
  "admin/panel-loading": {
    componentKey: "AdminPanel",
    fixtureKey: "admin-loading",
  },
  "credit/new-rfq-submitting": {
    componentKey: "NewRfqForm",
    fixtureKey: "credit-new-rfq-submitting",
  },
  "credit/new-rfq-confirmed": {
    componentKey: "NewRfqForm",
    fixtureKey: "credit-new-rfq-confirmed",
  },
  // AdminPanel throughput banner arms (the `{message && …}` block): the
  // confirmation (accent-primary) and error (status-error) colour arms.
  "admin/panel-message": {
    componentKey: "AdminPanel",
    fixtureKey: "admin-message",
  },
  "admin/panel-message-error": {
    componentKey: "AdminPanel",
    fixtureKey: "admin-message-error",
  },
  // TileConfirmation "You Sold" verb arm (a Done execution with a Sell trade).
  "tile/execution-done-sell": {
    componentKey: "Tile",
    fixtureKey: "tile-exec-done-sell",
  },
  // TileNotional invalid-notional arm (accent-negative underline + error span).
  "tile/notional-error": {
    componentKey: "Tile",
    fixtureKey: "tile-notional-error",
  },
  // TileRfq "init" arm: the "Initiate RFQ" button (RFQ layout, no rfqTile entry).
  "tile/rfq-init": { componentKey: "Tile", fixtureKey: "tile-rfq-init" },

  // --- Phase V testid-gated interaction scenarios (see scenarioActions.ts) ---
  // FX blotter sort + filter + popovers (drive BlotterHeader / *Filter).
  "fx-blotter/sorted": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  "fx-blotter/filtered": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  "fx-blotter/no-match": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  "fx-blotter/filter-date": {
    componentKey: "FxBlotter",
    fixtureKey: "fx-trades",
  },
  "fx-blotter/filter-number": {
    componentKey: "FxBlotter",
    fixtureKey: "fx-trades",
  },
  "fx-blotter/filter-set": {
    componentKey: "FxBlotter",
    fixtureKey: "fx-trades",
  },
  // Blotter: a text column (currencyPair) sorts ascending on the first click →
  // the BlotterHeader `sort.direction === "asc"` (▲) arm.
  "fx-blotter/sorted-asc": {
    componentKey: "FxBlotter",
    fixtureKey: "fx-trades",
  },
  // Blotter date filter: select the "In range" comparator + fill value/valueTo +
  // apply → the DateFilter inRange (valueTo) input + the non-empty onApply path.
  "fx-blotter/filter-date-range": {
    componentKey: "FxBlotter",
    fixtureKey: "fx-trades",
  },
  // Blotter number filter: same as above for NumberFilter (inRange + valueTo).
  "fx-blotter/filter-number-range": {
    componentKey: "FxBlotter",
    fixtureKey: "fx-trades",
  },
  // NewRfqForm: select the Sell direction → the `var(--accent-negative)` button arm.
  "credit/new-rfq-sell": {
    componentKey: "NewRfqForm",
    fixtureKey: "credit-populated",
  },
  // SellSidePanel active ticket: type a price → the enabled-Submit truthy arms
  // (cursor "pointer" / opacity 1).
  "credit/sell-side-price-entered": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-active",
  },
  // Credit RFQ "All" filter tab (RfqFilterTabs).
  "credit/rfq-tiles-all": {
    componentKey: "RfqTilesPanel",
    fixtureKey: "credit-populated",
  },
  // Credit new-RFQ form states (InstrumentSearch / QuantityInput / submit gate).
  "credit/new-rfq-search-open": {
    componentKey: "NewRfqForm",
    fixtureKey: "credit-populated",
  },
  "credit/new-rfq-instrument-selected": {
    componentKey: "NewRfqForm",
    fixtureKey: "credit-populated",
  },
  "credit/new-rfq-filled": {
    componentKey: "NewRfqForm",
    fixtureKey: "credit-populated",
  },
  "credit/new-rfq-over-max": {
    componentKey: "NewRfqForm",
    fixtureKey: "credit-populated",
  },

  // --- Phase 9 deterministic tile execution / RFQ / stale arms ---
  // Their state is now injected through the seam (per-symbol tileExecution /
  // rfqTile / stale records), so each transient timer state is a static shot —
  // no scenarioActions (no clicks / waits).
  // TileConfirmation overlay arms.
  "tile/execution-started": {
    componentKey: "Tile",
    fixtureKey: "tile-exec-started",
  },
  "tile/execution-too-long": {
    componentKey: "Tile",
    fixtureKey: "tile-exec-too-long",
  },
  "tile/execution-timeout": {
    componentKey: "Tile",
    fixtureKey: "tile-exec-timeout",
  },
  "tile/execution-done": { componentKey: "Tile", fixtureKey: "tile-exec-done" },
  "tile/execution-rejected": {
    componentKey: "Tile",
    fixtureKey: "tile-exec-rejected",
  },
  "tile/execution-credit-exceeded": {
    componentKey: "Tile",
    fixtureKey: "tile-exec-credit-exceeded",
  },
  "tile/execution-finished-timeout": {
    componentKey: "Tile",
    fixtureKey: "tile-exec-finished-timeout",
  },
  // TileRfq body arms (RfqCountdown green vs amber low-time).
  "tile/rfq-requested": {
    componentKey: "Tile",
    fixtureKey: "tile-rfq-requested",
  },
  "tile/rfq-received": {
    componentKey: "Tile",
    fixtureKey: "tile-rfq-received",
  },
  "tile/rfq-received-low": {
    componentKey: "Tile",
    fixtureKey: "tile-rfq-received-low",
  },
  "tile/rfq-rejected": {
    componentKey: "Tile",
    fixtureKey: "tile-rfq-rejected",
  },
  // StaleIndicator "Reconnecting…" overlay arm.
  "tile/stale": { componentKey: "Tile", fixtureKey: "tile-stale" },

  // --- Coverage-gap pass: behaviour-sync'd components (Step 5) ---

  // CreditBlotter sort: click the Quantity column header → CreditBlotter
  // handleSort fires, sort state changes, ▼ indicator appears on that column.
  // Covers CreditBlotter.tsx lines 104-108 (handleSort / nextSortDirection call).
  "credit/blotter-sorted": {
    componentKey: "CreditBlotter",
    fixtureKey: "credit-populated",
  },
  // CreditBlotter number filter: open the Quantity filter, enter a large
  // value (99999999) that no trade matches → "No credit trades match" message.
  // Covers handleFilter (lines 110-120), activeFilterLabels (128-131), and
  // the "No credit trades match" empty-row branch (line 195).
  "credit/blotter-filtered": {
    componentKey: "CreditBlotter",
    fixtureKey: "credit-populated",
  },
  // CreditBlotter quick-filter: type a string matching no trade →
  // covers QuickFilter.tsx onChange (line 20), setQuickFilter in CreditBlotter,
  // and the "No credit trades match" branch when quickFilter is non-empty.
  "credit/blotter-quick-filter": {
    componentKey: "CreditBlotter",
    fixtureKey: "credit-populated",
  },
  // RfqTilesPanel Done filter: click the "Done" tab with the credit-populated
  // fixture (which has rfq 102 in Closed state) → shows the Done rfq card.
  // Covers filterMatches Done branch (RfqTilesPanel.tsx line 20).
  "credit/rfq-tiles-filter-done": {
    componentKey: "RfqTilesPanel",
    fixtureKey: "credit-populated",
  },
  // RfqCountdown zero-expiry arm: an Open rfq with expirySecs=0 drives
  // totalMs=0 → RfqCountdown fraction = 0 (the `totalMs > 0 ? : 0` false
  // branch, RfqCountdown.tsx line 14). Bar renders at 0%.
  "credit/rfq-countdown-zero": {
    componentKey: "RfqTilesPanel",
    fixtureKey: "rfq-countdown-zero",
  },

  // --- Interaction scenarios whose handler produces a visible delta (firing
  // the handler is the only way to reach these lines in the visual tier; the
  // snapshot is meaningful because the post-interaction view differs) ---
  // SetFilter: open the Status set-filter popover, uncheck "Rejected", Apply →
  // the blotter drops the Rejected row + "Filtered: Status" toolbar label.
  // Covers SetFilter toggleValue / checkbox onChange / handleApply (filter arm).
  "fx-blotter/filter-set-applied": {
    componentKey: "FxBlotter",
    fixtureKey: "fx-trades",
  },
  // CurrencyFilter: click the GBP category → the active highlight moves and the
  // rate grid narrows to GBP pairs. Covers the button onClick → onChange handler.
  "live-rates/currency-filtered": {
    componentKey: "LiveRatesPanel",
    fixtureKey: "live-rates-populated",
  },

  // --- Phase 1: in-house layout engine arrangements ---
  "layout/fx-default": {
    componentKey: "LayoutEngineDefault",
    fixtureKey: "app-fx",
  },
  "layout/fx-maximized": {
    componentKey: "LayoutEngineMaximized",
    fixtureKey: "app-fx",
  },
  "layout/fx-collapsed": {
    componentKey: "LayoutEngineCollapsed",
    fixtureKey: "app-fx",
  },

  // --- Phase 2: HUD shell surfaces ---
  // Boot is captured under reduced motion (canvas suppressed) so only the
  // deterministic chrome is golden'd; the per-variant animated canvas art is
  // verified in-browser, not pixel-diffed (it is rAF/time-driven, not freezable
  // by `animations: "disabled"`). See the runner specs / scenarioActions.
  "boot/chrome": { componentKey: "BootSequence", fixtureKey: "boot" },
  "lock/locked": { componentKey: "LockScreen", fixtureKey: "session-locked" },
  "chrome/header": {
    componentKey: "HeaderChrome",
    fixtureKey: "app-connected",
  },
  "status/bar": { componentKey: "StatusBar", fixtureKey: "app-connected" },
  "prefs/modal": { componentKey: "PreferencesModal", fixtureKey: "prefs-open" },

  // --- Phase 5: Admin observability dashboard scenarios ---
  // Full AdminDashboard with all telemetry cards rendered from seeded data.
  "admin/dashboard": {
    componentKey: "AdminDashboard",
    fixtureKey: "admin-loaded",
  },
  // ServiceTopologyGraph isolated: seeded nodes + edges with a degraded credit node.
  "admin/topology": {
    componentKey: "ServiceTopologyGraph",
    fixtureKey: "admin-loaded",
  },
  // LiveEventLog isolated: seeded events across info/warn/error severity arms.
  "admin/event-log": {
    componentKey: "LiveEventLog",
    fixtureKey: "admin-loaded",
  },
  // IncidentControls with serviceDown active: "Inject service down" button has
  // data-active="true"; state is injected through the seam — no click needed.
  "admin/incident-active": {
    componentKey: "IncidentControls",
    fixtureKey: "admin-incident-active",
  },
};
