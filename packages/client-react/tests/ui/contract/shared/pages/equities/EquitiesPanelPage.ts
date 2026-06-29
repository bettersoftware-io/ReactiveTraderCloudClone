import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for the EquitiesPanel module root. Composes the watchlist, sector
 * heatmap, instrument tabs, chart, order ticket, depth ladder and the
 * orders/positions blotters around a lifted `selectedSymbol` (defaulting to the
 * first instrument) plus a local orders/positions blotter toggle.
 */
export class EquitiesPanelPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** The "select an instrument" placeholder, shown when the watchlist is empty. */
  placeholder(): string | null {
    const el = within(this.root).queryByText(/select an instrument/i);
    return el?.textContent?.trim() ?? null;
  }

  /** The active price-chart heading (e.g. "AAPL — PRICE CHART"), or null. */
  chartHeading(): string | null {
    const el = within(this.root).queryByText(/— price chart/i);
    return el?.textContent?.trim() ?? null;
  }

  /** True when the order ticket is rendered (an active symbol is selected). */
  hasOrderTicket(): boolean {
    return within(this.root).queryByTestId("order-ticket") !== null;
  }

  /** True while the orders blotter is showing (vs the positions blotter). */
  showsOrders(): boolean {
    return within(this.root).queryByText(/no orders/i) !== null;
  }

  /** True while the positions blotter is showing (vs the orders blotter). */
  showsPositions(): boolean {
    return within(this.root).queryByText(/no positions/i) !== null;
  }

  private blotterTab(label: RegExp): HTMLElement {
    return within(this.root).getByRole("button", { name: label });
  }

  /** Switch the blotter pane to the positions view. */
  async showPositions(): Promise<void> {
    await this.user.click(this.blotterTab(/^positions$/i));
  }

  /** Switch the blotter pane to the orders view. */
  async showOrders(): Promise<void> {
    await this.user.click(this.blotterTab(/^orders$/i));
  }

  /** Select an instrument by clicking its watchlist row. */
  async selectFromWatchlist(symbol: string): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId(`watchlist-row-${symbol}`),
    );
  }

  /** The active instrument tab's symbol, or null when none is active. */
  activeTab(): string | null {
    const active = within(this.root)
      .queryAllByTestId(/^instrument-tab-/)
      .find((el) => {
        return el.getAttribute("data-active") === "true";
      });
    return (
      active?.getAttribute("data-testid")?.replace("instrument-tab-", "") ??
      null
    );
  }
}
