import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for the AnalyticsPanel feature root. It is hook-driven (reads
 * `useAnalytics`), so it carries no props.
 */
export class AnalyticsPanelPage extends MountedComponent<
  Record<string, never>
> {
  /** True once the panel (rather than the loading placeholder) is showing. */
  isLoaded(): boolean {
    return within(this.root).queryByTestId("analytics-panel") !== null;
  }

  /** The loading-placeholder text, or null once data has arrived. */
  loadingMessage(): string | null {
    if (this.isLoaded()) return null;
    const el = within(this.root).queryByText(/loading analytics/i);
    return el?.textContent?.trim() ?? null;
  }

  /** The section labels shown down the panel, in order. */
  sectionLabels(): string[] {
    return [/profit & loss/i, /^positions$/i, /pnl per currency pair/i]
      .map((re) => {
        return within(this.root).queryByText(re)?.textContent?.trim() ?? "";
      })
      .filter((t) => {
        return t.length > 0;
      });
  }

  /** The formatted latest-P&L figure the panel summarises, e.g. "+12.5k". */
  latestPnlText(): string {
    const label = within(this.root).getByText(/profit & loss/i);
    // The PnlValue leaf is the next element sibling after the section label.
    const value = label.nextElementSibling;
    return value?.textContent?.trim() ?? "";
  }

  /** True when the stale overlay ("Reconnecting...") is visible. */
  isStale(): boolean {
    return within(this.root).queryByText(/reconnecting/i) !== null;
  }
}
