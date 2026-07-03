import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Page object for LiveRatesHead + LiveRatesPanel mounted together (sharing
 * one FxViewProvider, as they do under the real panel header/body split) —
 * exercises the Task 11 head-tabs/CHARTS-chip contract that neither component
 * carries on its own. */
export class LiveRatesWorkspacePage extends MountedComponent<
  Record<string, never>
> {
  private readonly user: UserEvent = userEvent.setup();

  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  isRatesTabActive(): boolean {
    return (
      this.q().getByTestId("rates-tab-live").getAttribute("data-active") ===
      "true"
    );
  }

  isWatchlistTabActive(): boolean {
    return (
      this.q()
        .getByTestId("rates-tab-watchlist")
        .getAttribute("data-active") === "true"
    );
  }

  async selectWatchlistTab(): Promise<void> {
    await this.user.click(this.q().getByTestId("rates-tab-watchlist"));
  }

  async selectRatesTab(): Promise<void> {
    await this.user.click(this.q().getByTestId("rates-tab-live"));
  }

  hasWatchlistPlaceholder(): boolean {
    return this.q().queryByTestId("watchlist-placeholder") !== null;
  }

  watchlistPlaceholderText(): string | null {
    return (
      this.q().queryByTestId("watchlist-placeholder")?.textContent?.trim() ??
      null
    );
  }

  isChartsActive(): boolean {
    return (
      this.q().getByTestId("charts-toggle").getAttribute("data-active") ===
      "true"
    );
  }

  async toggleCharts(): Promise<void> {
    await this.user.click(this.q().getByTestId("charts-toggle"));
  }

  /** True when at least one tile renders a chart (svg sparkline, chart view). */
  hasAnyChart(): boolean {
    return this.root.querySelector("svg") !== null;
  }
}
