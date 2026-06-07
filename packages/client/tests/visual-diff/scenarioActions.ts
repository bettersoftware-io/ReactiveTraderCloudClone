// Runner-neutral description of how each visual scenario is stabilized and
// captured. The DOM hooks (testids, visible text, the throughput URL) are
// framework-agnostic, so plain-Playwright and vitest-browser share this table.
// CT specs do not use it — they were hand-written first and stay as-is.

export type ScenarioAction = {
  /** Screenshot the whole page (full App or a fixed-position overlay) rather
   *  than just the #scenario-root component box. */
  readonly fullPage?: boolean;
  /** A `**\/throughput` JSON response to stub before navigation (admin only). */
  readonly stubThroughput?: number;
  /** A testid to click after the page settles (e.g. a tab or the theme toggle). */
  readonly click?: string;
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
    stubThroughput: 250,
    click: "tab-admin",
    waitForText: "Throughput Control",
  },
  "app/fx-light": {
    fullPage: true,
    click: "theme-toggle",
    assertAriaLabelOf: "theme-toggle",
    expectAriaLabel: "Switch to dark theme",
  },
};
