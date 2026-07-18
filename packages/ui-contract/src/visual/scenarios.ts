import type { ThemeMode, ThemeModePreference, ThemeSkin } from "@rtc/domain";

// Neutral manifest: a scenario name maps to a component key (resolved per
// framework by registry.tsx) and a fixture key (resolved from fixtures.ts).
export interface Scenario {
  readonly componentKey: string;
  readonly fixtureKey: string;
  /** Theme-skin override layered onto the fixture's AppData by VisualScenario.
   *  Matrix-expanded scenarios set this; base scenarios omit it and fall back
   *  to the fixture's own themeSkin (classic in the fakes). */
  readonly themeSkin?: ThemeSkin;
  /** Theme-mode override (see themeSkin). */
  readonly themeMode?: ThemeModePreference;
}

const baseScenarios: Record<string, Scenario> = {
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
  "live-rates/watchlist": {
    componentKey: "FxWatchlist",
    fixtureKey: "watchlist-populated",
  },
  "app/fx": { componentKey: "App", fixtureKey: "app-fx" },
  // Power-saver variant: same App scenario, seeded with powerSaver: true so the
  // aurora glow / drifting ambient-background layers are suppressed (static
  // grid + vignette only). See fixtures.ts's "app-fx-power-saver".
  "app/fx-power-saver": {
    componentKey: "App",
    fixtureKey: "app-fx-power-saver",
  },
  // Aurora ambient-style variant: same App scenario, seeded with ambientStyle
  // "aurora" so the backdrop renders the northern-lights curtains instead of
  // the default rays. See fixtures.ts's "app-fx-aurora".
  "app/fx-aurora": {
    componentKey: "App",
    fixtureKey: "app-fx-aurora",
  },
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
  // Activity tab, empty state — "fx-trades" has no `activity` set so it
  // defaults to [] (the feed starts empty until a trade executes).
  "fx-blotter/activity-empty": {
    componentKey: "FxActivityView",
    fixtureKey: "fx-trades",
  },
  // Activity tab, populated — one TRADE row + one REJECT row, newest first.
  "fx-blotter/activity-populated": {
    componentKey: "FxActivityView",
    fixtureKey: "fx-activity-populated",
  },
  // Credit tab — component-level views + the full page (Credit tab active).
  "credit/blotter": {
    componentKey: "CreditBlotter",
    fixtureKey: "credit-populated",
  },
  "credit/sell-side": {
    componentKey: "SellSidePanel",
    fixtureKey: "credit-populated",
  },
  "app/credit": { componentKey: "App", fixtureKey: "credit-populated" },
  // Credit dock: RfqsPanel filter arms (live/closed) + card states, and the
  // New RFQ form (fresh/filled/sell-direction/confirmed). Replaces the old
  // rfqTiles/NewRfqForm goldens Task 4 retired against the new three-panel
  // dock components (RfqsPanel, RfqCard, NewRfqPanel).
  "credit/rfqs-live": {
    componentKey: "RfqsPanel",
    fixtureKey: "credit-populated",
  },
  "credit/rfqs-accepted": {
    componentKey: "RfqsPanel",
    fixtureKey: "credit-rfqs-closed",
  },
  "credit/rfqs-terminated": {
    componentKey: "RfqsPanel",
    fixtureKey: "credit-rfqs-terminated",
  },
  "credit/rfqs-empty": {
    componentKey: "RfqsPanel",
    fixtureKey: "credit-rfqs-empty",
  },
  "credit/rfqs-card-passed": {
    componentKey: "RfqCardStandalone",
    fixtureKey: "credit-card-passed",
  },
  "credit/rfqs-card-rejected": {
    componentKey: "RfqCardStandalone",
    fixtureKey: "credit-card-rejected",
  },
  "credit/rfqs-card-expired": {
    componentKey: "RfqCardStandalone",
    fixtureKey: "credit-card-expired",
  },
  "credit/new-rfq": {
    componentKey: "NewRfqPanel",
    fixtureKey: "credit-populated",
  },
  "credit/new-rfq-filled": {
    componentKey: "NewRfqPanel",
    fixtureKey: "credit-populated",
  },
  "credit/new-rfq-sell": {
    componentKey: "NewRfqPanel",
    fixtureKey: "credit-populated",
  },
  "credit/new-rfq-confirmed": {
    componentKey: "NewRfqPanel",
    fixtureKey: "credit-new-rfq-confirmed",
  },
  // Admin tab — App with the throughput fetch stubbed by the spec.
  "app/admin": { componentKey: "App", fixtureKey: "app-fx" },
  // Light-theme variant of the FX page (fixture seeds theme "light" through the seam).
  "app/fx-light": {
    componentKey: "App",
    fixtureKey: "app-fx-light",
    themeSkin: "classic",
    themeMode: "light",
  },
  // System mode-preference variant: pins the third (🖥️) toggle icon (resolves to dark).
  "app/fx-system": {
    componentKey: "App",
    fixtureKey: "app-fx-system",
    themeSkin: "classic",
    themeMode: "system",
  },

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
  // --- Phase 4: Equities panel scenarios ---
  // Per-component sub-views with deterministic fixed-data fixtures.
  // (equities/watchlist-loaded, equities/chart-loaded, equities/positions-with-pnl,
  // and equities/panel were retired in Task 6 along with the flat EquitiesPanel/
  // PriceChart/OrdersBlotter/PositionsBlotter/Watchlist components they mounted —
  // ChartPanel/EqBlotterPanel/WatchlistPanel are the four-panel-dock replacements;
  // Task 7 adds their scenarios below.)
  "equities/sector-heatmap": {
    componentKey: "EquitiesSectorHeatmap",
    fixtureKey: "equities-loaded",
  },
  "equities/depth-ladder": {
    componentKey: "EquitiesDepthLadder",
    fixtureKey: "equities-loaded",
  },
  // EqDepthDock's own arm: no instrument selected -> placeholder text (its
  // selected arm just delegates to DepthLadder, pinned above).
  "equities/depth-dock-empty": {
    componentKey: "EquitiesDepthDock",
    fixtureKey: "equities-no-selection",
  },
  "equities/ticket-editing": {
    componentKey: "EquitiesOrderTicket",
    fixtureKey: "equities-ticket-editing",
  },
  "equities/ticket-filled": {
    componentKey: "EquitiesOrderTicket",
    fixtureKey: "equities-ticket-filled",
  },
  // --- Task 7: four-panel-dock replacement scenarios ---
  // Chart panel: instrument header + candlestick plot for the seeded
  // selection (AAPL), 3 open tabs (close ✕ affordance visible).
  "equities/chart-panel": {
    componentKey: "EquitiesChartPanel",
    fixtureKey: "equities-loaded",
  },
  // Instrument header standalone, forced flashOn=true — pins the tick-flash
  // accent arm no static ChartPanel capture (no live ticks) can reach.
  "equities/instrument-header": {
    componentKey: "EquitiesInstrumentHeader",
    fixtureKey: "equities-loaded",
  },
  // Watchlist rail — default sort (unset → DEFAULT_EQ_WATCHLIST_SORT "chg")
  // plus the other two ⇅ cycle arms (A–Z / PRICE).
  "equities/watchlist-loaded": {
    componentKey: "EquitiesWatchlistPanel",
    fixtureKey: "equities-loaded",
  },
  "equities/watchlist-sort-sym": {
    componentKey: "EquitiesWatchlistPanel",
    fixtureKey: "equities-watchlist-sort-sym",
  },
  "equities/watchlist-sort-price": {
    componentKey: "EquitiesWatchlistPanel",
    fixtureKey: "equities-watchlist-sort-price",
  },
  // Orders/Positions blotter — default view (unset → "orders") plus the
  // ◴ Positions arm (DeskPnlGauge + PnlSparkline cells).
  "equities/blotter-orders": {
    componentKey: "EquitiesBlotterPanel",
    fixtureKey: "equities-loaded",
  },
  "equities/blotter-positions": {
    componentKey: "EquitiesBlotterPanel",
    fixtureKey: "equities-blotter-positions",
  },
  // Full App shot with the equities tab active (parallels app/fx + app/credit).
  "app/equities": { componentKey: "App", fixtureKey: "equities-loaded" },

  // Admin panel loaded (slider) state — throughput fetch stubbed.
  "admin/panel-loaded": { componentKey: "AdminPanel", fixtureKey: "app-fx" },
  // Seeded render-state arm with no interaction (the state is only transiently
  // reachable at runtime, so it is seeded through the seam for a stable golden):
  // AdminPanel loading.
  "admin/panel-loading": {
    componentKey: "AdminPanel",
    fixtureKey: "admin-loading",
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
  // SellSidePanel active ticket: type a price → the enabled-Submit truthy arms
  // (cursor "pointer" / opacity 1).
  "credit/sell-side-price-entered": {
    componentKey: "SellSidePanel",
    fixtureKey: "sell-side-active",
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
  // covers QuickFilter.tsx onChange (line 20), the CreditViewContext
  // quickFilter seam, and the "No credit trades match" branch when
  // quickFilter is non-empty. The input lives in the panel's head slot now
  // (CreditBlotterHead), so this mounts head + body together, sharing one
  // CreditViewProvider like the real panel header/body split.
  "credit/blotter-quick-filter": {
    componentKey: "CreditBlotterWorkspace",
    fixtureKey: "credit-populated",
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
  // Nearest-column (rail-scoped) maximize: fx-analytics fills its rail while
  // fx-positions strips to a horizontal bar INSIDE it; the main column and
  // the rail's 360px design width stay untouched (standalone semantics).
  "layout/fx-rail-maximized": {
    componentKey: "LayoutEngineRailMaximized",
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
  // The skin listbox open (click action) — swatch rows per skin; the closed
  // trigger is already in every chrome/header golden.
  "chrome/theme-picker-open": {
    componentKey: "ChromeThemePicker",
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
  // KpiRow isolated: the "loaded" baseline arm — all four cards warn=false.
  "admin/kpi-row": {
    componentKey: "KpiRow",
    fixtureKey: "admin-loaded",
  },
  // KpiRow isolated warn arm: latency + error-rate cross their warn thresholds
  // (lat>60, err>0.8) → the accent-negative value/delta colour on those cards.
  "admin/kpi-row-warn": {
    componentKey: "KpiRow",
    fixtureKey: "admin-kpi-warn",
  },
  // ServiceHealth isolated: mixed status arms (ok/degraded/down) in one
  // topology snapshot — "down" is a real-app extra with no PROTO equivalent.
  "admin/service-health": {
    componentKey: "ServiceHealth",
    fixtureKey: "admin-service-mixed",
  },
  // AdminHead isolated: nominal (no incident active) vs incident-active pill
  // arms — the real useIncident() wiring IncidentControls also drives.
  "admin/head-nominal": {
    componentKey: "AdminHead",
    fixtureKey: "admin-loaded",
  },
  "admin/head-incident": {
    componentKey: "AdminHead",
    fixtureKey: "admin-incident-active",
  },
};

// The theme matrix: every skin except neon × dark/light. Every base scenario is
// REPLACED by its full 10-combo cross-product (each combo carries an explicit
// themeSkin/themeMode), so there is no bare baseline — classic-dark is the
// `classic-dark/` folder like any other combo.
export const MATRIX_SKINS: readonly ThemeSkin[] = [
  "classic",
  "holo",
  "holo3d",
  "terminal",
  "terminal3d",
] as const satisfies readonly ThemeSkin[];
export const MATRIX_MODES: readonly ThemeMode[] = [
  "dark",
  "light",
] as const satisfies readonly ThemeMode[];

// Scenarios that assert a mode-cycle-specific theme-toggle aria-label — they
// prove the toggle cycle, not the skin matrix, so they are NOT cross-producted.
// They carry their own authored themeSkin/themeMode (Step 1), so goldenPath still
// routes them to a folder (classic-light / classic-system).
const MATRIX_EXCLUDE = new Set<string>(["app/fx-light", "app/fx-system"]);

function expandThemeMatrix(
  base: Record<string, Scenario>,
): Record<string, Scenario> {
  const out: Record<string, Scenario> = {};

  for (const [name, scenario] of Object.entries(base)) {
    if (MATRIX_EXCLUDE.has(name)) {
      out[name] = scenario;
      continue;
    }

    for (const skin of MATRIX_SKINS) {
      for (const mode of MATRIX_MODES) {
        out[`${name}__${skin}-${mode}`] = {
          ...scenario,
          themeSkin: skin,
          themeMode: mode,
        };
      }
    }
  }

  return out;
}

export const scenarios: Record<string, Scenario> =
  expandThemeMatrix(baseScenarios);
