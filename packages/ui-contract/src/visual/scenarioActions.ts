// Runner-neutral description of how each visual scenario is stabilized and
// captured. The DOM hooks (testids, visible text) are framework-agnostic, so
// both surviving tiers (plain-Playwright, and the vitest-browser coverage
// instrument) share this table via `scenarioActionFor`.

import { baseScenarioName } from "./goldenPath";

// A single ordered interaction step for multi-step scenarios (form fill, open a
// filter popover then apply it). Runner-neutral: keyed on testids + literal
// text/values so plain-Playwright and vitest-browser drive them identically.
type ScenarioStep =
  /** Click the element with this testid. */
  | { readonly click: string }
  /** Type `text` into the input with this testid (clears first). */
  | { readonly type: string; readonly text: string }
  /** Select `value` in the <select> with this testid. */
  | { readonly select: string; readonly value: string };

export type ScenarioAction = {
  /** Screenshot the whole page (full App or a fixed-position overlay) rather
   *  than just the #scenario-root component box. */
  readonly fullPage?: boolean;
  /** Emulate `prefers-reduced-motion: reduce` before rendering. The boot
   *  sequence reads it to skip its rAF canvas loop, so only the deterministic
   *  chrome is captured (the animated canvas art is intentionally not golden'd). */
  readonly reducedMotion?: boolean;
  /** A testid to click after the page settles (e.g. a tab or the theme toggle). */
  readonly click?: string;
  /** Ordered interaction steps, run after `click`, before `waitForText`. Used
   *  for blotter sort/filter and the new-RFQ form states. */
  readonly steps?: readonly ScenarioStep[];
  /** Visible text to wait for after the click, proving the view switched. */
  readonly waitForText?: string;
} & (
  | {
      /** A testid whose aria-label must equal `expectAriaLabel` before capture. */
      readonly assertAriaLabelOf?: undefined;
      readonly expectAriaLabel?: undefined;
    }
  | {
      readonly assertAriaLabelOf: string;
      readonly expectAriaLabel: string;
    }
);

// Keyed by scenario name (see @rtc/ui-contract's src/visual/scenarios.ts). Absent key == a
// component-level shot with no interaction.
// Module-private: the tiers consume this table only through `scenarioActionFor`
// below (which maps matrix-expanded names back to their base action).
const scenarioActions: Record<string, ScenarioAction> = {
  "connection-overlay/offline": { fullPage: true },
  "connection-overlay/idle": { fullPage: true },
  "app/fx": { fullPage: true },
  // Power-saver: same full-page capture as app/fx — the seeded powerSaverLevel
  // "calm" suppresses the aurora/drift layers, so the diff is entirely in the
  // background, not the interaction.
  "app/fx-power-saver": { fullPage: true },
  // The aurora ambient-style variant of the FX page — a full-bleed App scenario
  // like app/fx, so it must capture full-page (App renders no scenario-root
  // wrapper). #259 added the scenario without this action, so the harness fell
  // through to the element-capture branch and timed out waiting for scenario-root.
  "app/fx-aurora": { fullPage: true },
  // The credit blotter's in-body "Credit Trades" title is gone (its chrome
  // moved into the panel head) — the head tab's full text proves the credit
  // workspace rendered.
  "app/credit": {
    fullPage: true,
    click: "tab-credit",
    waitForText: "▤ Credit Blotter",
  },
  "app/admin": {
    fullPage: true,
    click: "tab-admin",
    // "Throughput Control" now appears twice (engine panel header + AdminPanel h2);
    // "Updates/sec" is unique to the AdminPanel slider row and proves the panel loaded.
    waitForText: "Updates/sec",
  },
  // Light theme is seeded through the seam (fixture app-fx-light, theme "light"),
  // so no toggle click is needed; the ThemeToggle's aria-label confirms the
  // light arm rendered (in the 3-state cycle, "light" offers a switch to system).
  "app/fx-light": {
    fullPage: true,
    assertAriaLabelOf: "theme-toggle",
    expectAriaLabel: "Switch to system theme",
  },
  // System preference: the toggle shows 🖥️ and offers a switch to dark (cycle wrap).
  "app/fx-system": {
    fullPage: true,
    assertAriaLabelOf: "theme-toggle",
    expectAriaLabel: "Switch to dark theme",
  },
  // Price view is seeded through the seam (fixture live-rates-price, viewMode
  // "price") — no interaction needed, no entry required (lookups fall back to
  // `{}`). The CHARTS toggle that used to live inline (and read "Chart" when
  // offering a switch back) moved to the fx-rates panel's head slot
  // (LiveRatesHead, outside this standalone component) once the panel head
  // grew tabs; the screenshot alone proves the price-mode arm (charts
  // suppressed) rendered.
  // Admin panel loaded state: the seam fake provides a loaded value (250).
  "admin/panel-loaded": { waitForText: "Throughput Control" },

  // Dockview engine (spec 2026-08-11): the 4 fx panels mount async via a
  // useEffect-driven portal (DockviewLayoutEngine's `mounted` state, set
  // once createDockEngine's panel-mount callback fires), unlike the in-house
  // engine's synchronous render — so this needs a waitForText the sync
  // layout/fx-* scenarios don't. "FX-RATES-BODY" is the fx-rates stub's full
  // body text (the visual wrapper's own 4-panel registry, not the in-house
  // engine's "LIVE RATES" stub or the contract tier's plain "RATES"). Must be
  // this specific, non-generic string: `getByText` is a case-insensitive
  // SUBSTRING match with no `exact` option on `ScenarioAction`, and
  // dockview's own tab title for fx-rates is "Live Rates" (PANEL_SPECS) — a
  // plain "RATES" here strict-mode-violated (matched both the stub body and
  // the tab).
  "shell/layout-dockview": { waitForText: "FX-RATES-BODY" },

  // --- Phase V testid-gated interaction scenarios ---
  // Blotter: click a column header to sort (ascending arrow appears). No
  // waitForText: the click is synchronous and "Notional" is non-unique.
  "fx-blotter/sorted": { click: "blotter-sort-notional" },
  // Blotter: open the Notional number filter, enter an exact value, apply ->
  // a subset of rows survives (eq 1,000,000 keeps only trade 4001).
  "fx-blotter/filtered": {
    steps: [
      { click: "blotter-filter-toggle-notional" },
      { type: "number-filter-value", text: "1000000" },
      { click: "number-filter-apply" },
    ],
    waitForText: "Filtered: Notional",
  },
  // Blotter: a filter matching zero rows -> the empty "no rows match" message.
  "fx-blotter/no-match": {
    steps: [
      { click: "blotter-filter-toggle-notional" },
      { type: "number-filter-value", text: "1" },
      { click: "number-filter-apply" },
    ],
    waitForText: "No trades match the current filters",
  },
  // Blotter: open each filter-type popover (no apply) to snapshot the controls.
  // Number/date popovers carry a unique "Reset" button; the set popover has
  // only "Apply" (no comparator <select>, so its options can't shadow it).
  "fx-blotter/filter-date": {
    click: "blotter-filter-toggle-tradeDate",
    waitForText: "Reset",
  },
  "fx-blotter/filter-number": {
    click: "blotter-filter-toggle-notional",
    waitForText: "Reset",
  },
  "fx-blotter/filter-set": {
    click: "blotter-filter-toggle-status",
    waitForText: "Apply",
  },

  // Blotter: click a TEXT column (CCYCCY/currencyPair) once -> first click is
  // ascending (BlotterHeader's ▲ arm). No waitForText (synchronous, label non-unique).
  "fx-blotter/sorted-asc": { click: "blotter-sort-currencyPair" },
  // Blotter date filter: open the tradeDate popover, switch to "In range" (reveals
  // the valueTo input), fill both dates, apply -> the DateFilter inRange + the
  // non-empty onApply (value/valueTo) path.
  "fx-blotter/filter-date-range": {
    steps: [
      { click: "blotter-filter-toggle-tradeDate" },
      { select: "date-filter-comparator", value: "inRange" },
      { type: "date-filter-value", text: "2026-06-01" },
      { type: "date-filter-value-to", text: "2026-06-30" },
      { click: "date-filter-apply" },
    ],
    waitForText: "Filtered: Trade Date",
  },
  // Blotter number filter: open the notional popover, switch to "In range", fill
  // both bounds, apply -> the NumberFilter inRange + valueTo onApply path.
  "fx-blotter/filter-number-range": {
    steps: [
      { click: "blotter-filter-toggle-notional" },
      { select: "number-filter-comparator", value: "inRange" },
      { type: "number-filter-value", text: "1000000" },
      { type: "number-filter-value-to", text: "6000000" },
      { click: "number-filter-apply" },
    ],
    waitForText: "Filtered: Notional",
  },
  // SellSidePanel active ticket: type a price into the price input -> the
  // enabled-Submit truthy arms (cursor "pointer" / opacity 1).
  "credit/sell-side-price-entered": {
    steps: [{ type: "trade-ticket-price", text: "98.5" }],
  },
  // NewRfqPanel instrument dropdown open: click the toggle and STOP — unlike
  // new-rfq-filled (which selects an option and closes the list), this leaves
  // the floating popover open so its frosted-glass backing is the captured
  // pixel state.
  "credit/new-rfq-open": { click: "new-rfq-instrument-toggle" },
  // NewRfqPanel filled arm: select an instrument, fill qty, select all
  // dealers -> validation passes, SEND RFQ becomes enabled (data-enabled=true).
  "credit/new-rfq-filled": {
    steps: [
      { click: "new-rfq-instrument-toggle" },
      { click: "new-rfq-instrument-option-1" },
      { type: "new-rfq-qty-input", text: "5000" },
      { click: "new-rfq-dealer-all" },
    ],
  },
  // NewRfqPanel direction toggle: click "You Sell" -> the accent-negative
  // active-button arm (DirButton data-dir="sell" data-active="true").
  "credit/new-rfq-sell": { click: "new-rfq-dir-sell" },

  // ThemePicker skin listbox open — the dropdown is the distinct pixel state.
  "chrome/theme-picker-open": { click: "skin-picker" },

  // Account dropdown open — click the avatar trigger and STOP; the open panel
  // (identity/details/action-rows) is the captured pixel state. Wait for the
  // static "CLEARANCE" details key (unique to the open panel, casing-stable) to
  // confirm the dropdown rendered before capture.
  "chrome/account-menu-open": {
    click: "account-toggle",
    waitForText: "CLEARANCE",
  },

  // --- Coverage-gap pass: behaviour-sync'd components (Step 5) ---

  // CreditBlotter sort: click the Quantity column sort button -> ▼ appears.
  // First click on a CREDIT_DESC_FIRST column (tradeId/tradeDate) goes desc;
  // quantity is NOT in CREDIT_DESC_FIRST so first click goes asc (▲).
  "credit/blotter-sorted": { click: "blotter-sort-quantity" },
  // CreditBlotter number filter: open the Quantity filter, enter a value that
  // matches no trade (e.g. 1), apply -> "No credit trades match" message +
  // "Filtered: Quantity" label on toolbar.
  "credit/blotter-filtered": {
    steps: [
      { click: "blotter-filter-toggle-quantity" },
      { type: "number-filter-value", text: "1" },
      { click: "number-filter-apply" },
    ],
    waitForText: "Filtered: Quantity",
  },
  // CreditBlotter quick-filter: type text matching no credit trade ->
  // "No credit trades match" message.
  "credit/blotter-quick-filter": {
    steps: [{ type: "quick-filter", text: "zzznomatch" }],
    waitForText: "No credit trades match the current filters",
  },
  // SetFilter applied: open the Status set-filter popover, uncheck "Rejected",
  // Apply -> the Rejected row is filtered out (toggleValue / onChange / applySelectedValues).
  "fx-blotter/filter-set-applied": {
    steps: [
      { click: "blotter-filter-toggle-status" },
      { click: "set-filter-option-Rejected" },
      { click: "set-filter-apply" },
    ],
    waitForText: "Filtered: Status",
  },
  // CurrencyFilter: click the GBP category button -> the grid narrows to GBP
  // pairs and that button becomes active. Click is synchronous (local state),
  // so no waitForText (the "GBP" label is non-unique against the pair rows).
  "live-rates/currency-filtered": { click: "filter-GBP" },

  // --- Phase 4: Equities panel ---
  // Full App shot: click the equities tab, wait for the watchlist head's "☰
  // Watchlist" tab label to confirm the four-panel dock rendered (analogous to
  // app/credit + app/admin patterns). Task 6 flipped the layout from the flat
  // EquitiesPanel (which rendered a "WATCHLIST" section heading) to the dock —
  // WorkspaceEngine remounts per tab (App.tsx `key={activeTab}`), so this text
  // is unique to the equities tab even though FX's LiveRatesHead renders the
  // same literal string (it unmounts when the equities tab is active).
  "app/equities": {
    fullPage: true,
    click: "tab-equities",
    waitForText: "☰ Watchlist",
  },

  // --- Phase 2: HUD shell surfaces ---
  // Boot chrome under reduced motion (canvas loop skipped → deterministic).
  "boot/chrome": {
    fullPage: true,
    reducedMotion: true,
    waitForText: "TACTICAL TRADING OPERATING SYSTEM · v4.0",
  },
  // Lock + preferences are fixed-position viewport overlays → full-page capture.
  "lock/locked": { fullPage: true, waitForText: "SESSION LOCKED" },
  // Login/lock-wait treatments: state is seeded through the seam (no click
  // needed), so this is a static shot like the tile execution/RFQ arms above.
  // "AWAITING AUTH GRANT" is rendered by both HandshakeConsole and ReactorWait
  // (see their component source), so it proves either treatment mounted.
  // Fixed-position viewport overlays like lock/locked → full-page capture.
  "login/wait-handshake": {
    fullPage: true,
    waitForText: "AWAITING AUTH GRANT",
  },
  "login/wait-reactor": { fullPage: true, waitForText: "AWAITING AUTH GRANT" },
  "lock/wait-handshake": { fullPage: true, waitForText: "AWAITING AUTH GRANT" },
  "lock/wait-reactor": { fullPage: true, waitForText: "AWAITING AUTH GRANT" },
  // Freeze-tier wait treatments: same static full-page shot as the non-freeze
  // arms above, seeded via powerSaverLevel "freeze" in the fixture instead of
  // a click.
  "login/wait-handshake-freeze": {
    fullPage: true,
    waitForText: "AWAITING AUTH GRANT",
  },
  "login/wait-reactor-freeze": {
    fullPage: true,
    waitForText: "AWAITING AUTH GRANT",
  },
  "prefs/modal": { fullPage: true, waitForText: "PREFERENCES" },
  // Element shot (scenario-root). "Narrator" is the last row of column 2, so
  // waiting for it proves the whole grid — incl. the JARVIS section that
  // prefs/modal clips — is rendered before capture.
  "prefs/content": { waitForText: "Narrator" },

  // --- Phase 1: J.A.R.V.I.S overlay --- fixed-position viewport overlay,
  // same treatment as prefs/modal above — full-page capture, no interaction
  // (both fixtures seed `open: true` through the seam).
  "jarvis/overlay-chat": { fullPage: true },
  // Freeze-tier render: same static full-page shot, seeded via powerSaverLevel
  // "freeze" in the fixture instead of a click — mirrors the
  // login/wait-*-freeze scenarios' action entries. Unlike those, this overlay
  // renders no unique "waiting" copy, so waitForText targets the fixture's
  // fixed jarvis reply text instead — freeze.spec.ts needs SOME waitForText
  // here since this is a fullPage scenario with no `scenario-root` box.
  "jarvis/overlay-chat-freeze": {
    fullPage: true,
    waitForText: "EURUSD is quoting 1.09213 / 1.09227, up on the session.",
  },
  "jarvis/overlay-confirm": { fullPage: true },
  // Demo guide panel: click the ⓘ toggle, then wait for copy that only
  // exists inside the open `<aside>` itself — "DEMO GUIDE" alone also
  // case-insensitively matches the footer's own "ⓘ DEMO GUIDE" toggle
  // button, which is a strict-mode ambiguity (both are always in the DOM
  // once open) — proof the panel actually mounted, not just its toggle
  // chrome (mirrors the panel scenarios' first-mount-race guard below).
  "jarvis/overlay-guide": {
    fullPage: true,
    click: "jarvis-guide-toggle",
    waitForText: "RUN FULL DEMO · HANDS-FREE",
  },

  // Task 10 (generative-UI round 1): JarvisPanelLayer is `position: fixed`
  // (top-right cascade, same as the overlay above), so it needs the same
  // full-page treatment. Each waitForText targets a string that only exists
  // once its renderer has actually painted (not just the panel chrome) —
  // guards the first-mount race the vitest-browser tier is prone to (see
  // reference_visual_scenario_add_recipe_and_gotchas). PanelLine renders no
  // visible text of its own (SVG path only), so it waits on the panel title
  // instead — still proof the card (and therefore its body) mounted.
  "jarvis/panel-line": { fullPage: true, waitForText: "GBP Volatility" },
  "jarvis/panel-table": { fullPage: true, waitForText: "+12,450" },
  "jarvis/panel-gauge": { fullPage: true, waitForText: "0.42%" },
  "jarvis/panel-spark-grid": { fullPage: true, waitForText: "+0.28%" },
  "jarvis/panel-heatmap": { fullPage: true, waitForText: "+0.54%" },
  // "UNSUPPORTED PANEL" alone is ambiguous under Playwright's default
  // case-insensitive getByText — it also substring-matches the panel
  // chrome's own title span ("Unsupported panel", JarvisPanelsPresenter's
  // UNSUPPORTED_TITLE), so this targets the body copy's unique tail instead.
  "jarvis/panel-unsupported": {
    fullPage: true,
    waitForText: "has no renderer",
  },
};

/** Resolve the capture action for a scenario, mapping matrix-expanded names
 *  (`app/credit__holo-dark`) back to their base action (`app/credit`). */
export function scenarioActionFor(name: string): ScenarioAction {
  return scenarioActions[name] ?? scenarioActions[baseScenarioName(name)] ?? {};
}
