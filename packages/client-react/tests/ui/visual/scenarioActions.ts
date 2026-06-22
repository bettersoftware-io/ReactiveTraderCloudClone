// Runner-neutral description of how each visual scenario is stabilized and
// captured. The DOM hooks (testids, visible text) are framework-agnostic, so
// plain-Playwright and vitest-browser share this table. CT specs do not use it —
// they were hand-written first and stay as-is.

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

// Keyed by scenario name (see shared/scenarios.ts). Absent key == a
// component-level shot with no interaction.
export const scenarioActions: Record<string, ScenarioAction> = {
  "connection-overlay/offline": { fullPage: true },
  "app/fx": { fullPage: true },
  "app/credit": {
    fullPage: true,
    click: "tab-credit",
    waitForText: "Credit Trades",
  },
  "app/admin": {
    fullPage: true,
    click: "tab-admin",
    waitForText: "Throughput Control",
  },
  // Light theme is seeded through the seam (fixture app-fx-light, theme "light"),
  // so no toggle click is needed; the ThemeToggle's aria-label confirms the
  // light arm rendered (it offers a switch back to dark).
  "app/fx-light": {
    fullPage: true,
    assertAriaLabelOf: "theme-toggle",
    expectAriaLabel: "Switch to dark theme",
  },
  // Price view is seeded through the seam (fixture live-rates-price, viewMode
  // "price"); the ViewToggle label reads "Chart" (offering a switch back),
  // proving the price-mode arm rendered.
  "live-rates/price-view": { waitForText: "Chart" },
  // Credit workspace sub-views: click the tab, wait for that view's heading.
  "credit/workspace-new-rfq": {
    click: "credit-tab-new-rfq",
    waitForText: "Submit RFQ",
  },
  "credit/workspace-sell-side": {
    click: "credit-tab-sell-side",
    waitForText: "Sell Side (Adaptive Bank)",
  },
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

  // Credit RFQ filter: click the "All" tab (shows Live + terminal RFQs). No
  // waitForText: the click is synchronous and "All" is a non-unique substring.
  "credit/rfq-tiles-all": { click: "rfq-filter-All" },

  // Credit new-RFQ form states.
  // Search dropdown open with results (typed query matches instruments).
  "credit/new-rfq-search-open": {
    steps: [{ type: "instrument-search-input", text: "Treasury" }],
    waitForText: "CUSIP: 912828ZQ6",
  },
  // Instrument chosen -> the selected-instrument summary (CUSIP + Coupon).
  "credit/new-rfq-instrument-selected": {
    steps: [
      { type: "instrument-search-input", text: "Treasury" },
      { click: "instrument-result-1" },
    ],
    waitForText: "Coupon: 1.5%",
  },
  // Filled: instrument + (default) dealers + valid quantity -> submit enabled.
  "credit/new-rfq-filled": {
    steps: [
      { type: "instrument-search-input", text: "Treasury" },
      { click: "instrument-result-1" },
      { type: "quantity-input", text: "5000" },
    ],
    waitForText: "Submit RFQ",
  },
  // Invalid quantity (> CREDIT_MAX_QUANTITY_INPUT) -> the validation error.
  "credit/new-rfq-invalid": {
    steps: [
      { type: "instrument-search-input", text: "Treasury" },
      { click: "instrument-result-1" },
      { type: "quantity-input", text: "200000000" },
    ],
    waitForText: "Max quantity exceeded",
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
  // NewRfqForm: click the Sell direction button -> the selected Sell button's
  // var(--accent-negative) background arm.
  "credit/new-rfq-sell": { click: "rfq-direction-Sell" },
  // SellSidePanel active ticket: type a price into the price input -> the
  // enabled-Submit truthy arms (cursor "pointer" / opacity 1).
  "credit/sell-side-price-entered": {
    steps: [{ type: "trade-ticket-price", text: "98.5" }],
  },
};
