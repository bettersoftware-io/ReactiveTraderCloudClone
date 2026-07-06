import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Page object for FxBlotterHead + FxBlotter mounted together (sharing one
 * FxViewProvider, as they do under the real panel header/body split) —
 * exercises the Task 12 head-tabs/count/filter/CSV-chip contract that
 * neither component carries on its own. Mirrors LiveRatesWorkspacePage
 * (Task 11). */
export class FxBlotterWorkspacePage extends MountedComponent<
  Record<string, never>
> {
  private readonly user: UserEvent = userEvent.setup();

  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  isTradesTabActive(): boolean {
    return (
      this.q().getByTestId("blotter-tab-trades").getAttribute("data-active") ===
      "true"
    );
  }

  isActivityTabActive(): boolean {
    return (
      this.q()
        .getByTestId("blotter-tab-activity")
        .getAttribute("data-active") === "true"
    );
  }

  async selectActivityTab(): Promise<void> {
    await this.user.click(this.q().getByTestId("blotter-tab-activity"));
  }

  async selectTradesTab(): Promise<void> {
    await this.user.click(this.q().getByTestId("blotter-tab-trades"));
  }

  /** Standing regression guard: the old "COMING ONLINE" placeholder testid
   * must never reappear now that the Activity tab renders a real feed
   * (mirrors FxBlotterWorkspacePage's Watchlist-tab equivalent). */
  hasActivityPlaceholder(): boolean {
    return this.q().queryByTestId("activity-placeholder") !== null;
  }

  activityFeedText(): string | null {
    return this.q().queryByTestId("activity-feed")?.textContent?.trim() ?? null;
  }

  activityRowCount(): number {
    return this.q().queryAllByTestId("activity-row").length;
  }

  activityRowTexts(): string[] {
    return this.q()
      .queryAllByTestId("activity-row")
      .map((row) => {
        return row.textContent?.trim() ?? "";
      });
  }

  tradeCountText(): string | null {
    return this.q().queryByTestId("blotter-count")?.textContent?.trim() ?? null;
  }

  hasTradeCount(): boolean {
    return this.q().queryByTestId("blotter-count") !== null;
  }

  private table(): HTMLElement {
    return this.q().getByTestId("blotter-table");
  }

  tradeRowCount(): number {
    return this.table().querySelectorAll("tbody tr").length;
  }

  async typeQuickFilter(text: string): Promise<void> {
    const input = this.q().getByTestId("quick-filter");
    await this.user.clear(input);
    if (text) await this.user.type(input, text);
  }

  /** Export-CSV trigger, from the head's CSV chip. */
  async clickExport(): Promise<void> {
    await this.user.click(this.q().getByTestId("export-csv"));
  }
}
