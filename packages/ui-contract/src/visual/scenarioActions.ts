// Runner-neutral description of how each visual scenario is stabilized and
// captured. The DOM hooks (testids, visible text) are framework-agnostic, so
// all three tiers (plain-Playwright, vitest-browser, and the data-driven
// playwright-ct matrix.spec.tsx) share this table via `scenarioActionFor`.

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
  // Power-saver: same full-page capture as app/fx — the seeded powerSaver
  // preference suppresses the aurora/drift layers, so the diff is entirely in
  // the background, not the interaction.
  "app/fx-power-saver": { fullPage: true },
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
  // Apply -> the Rejected row is filtered out (toggleValue / onChange / handleApply).
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
  "prefs/modal": { fullPage: true, waitForText: "PREFERENCES" },
};

/** Resolve the capture action for a scenario, mapping matrix-expanded names
 *  (`app/credit__holo-dark`) back to their base action (`app/credit`). */
export function scenarioActionFor(name: string): ScenarioAction {
  return scenarioActions[name] ?? scenarioActions[baseScenarioName(name)] ?? {};
}
